import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { ocrBestVariant, type ImageQuality } from "./ocrCleanup";

/** A problem with the uploaded file itself; its message is safe to show the person. */
export class DocumentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ExtractionMethod =
  | "text"
  | "ocr"
  | "mixed";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  method: "text" | "ocr";
  /** OCR only: Tesseract confidence 0-100 after clean-up. */
  confidence?: number;
  /** OCR only: image quality rating and the problems found. */
  quality?: Pick<ImageQuality, "rating" | "issues">;
  /** OCR only: words read with low confidence, to check by eye. */
  uncertainWords?: string[];
};

export type ExtractedDocument = {
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number;
  extractionMethod: ExtractionMethod;
  text: string;
  pageData: ExtractedPage[];
  warnings: string[];
};

const MAX_TEXT_LENGTH = 500_000;
const OCR_THRESHOLD = 80;

function cleanText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");

  if (index === -1) {
    return "";
  }

  return fileName.slice(index + 1).toLowerCase();
}

function detectFileType(
  fileName: string,
  mimeType: string
):
  | "pdf"
  | "docx"
  | "image"
  | null {
  const extension = getExtension(fileName);

  if (
    extension === "pdf" ||
    mimeType === "application/pdf"
  ) {
    return "pdf";
  }

  if (
    extension === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }

  if (
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "webp" ||
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  ) {
    return "image";
  }

  return null;
}

function validateMagicBytes(
  buffer: Buffer,
  type: "pdf" | "docx" | "image"
): boolean {
  if (type === "pdf") {
    return buffer.subarray(0, 5).toString() === "%PDF-";
  }

  if (type === "image") {
    const png =
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ])
      );

    const jpeg =
      buffer.length >= 3 &&
      buffer.subarray(0, 3).equals(
        Buffer.from([0xff, 0xd8, 0xff])
      );

    const webp =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP";

    return png || jpeg || webp;
  }

  // DOCX is a ZIP container.
  if (type === "docx") {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  return false;
}

function limitText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return text.slice(0, MAX_TEXT_LENGTH).trim();
}

async function extractImage(
  buffer: Buffer
): Promise<{
  text: string;
  pageData: ExtractedPage[];
  extractionMethod: ExtractionMethod;
  warnings: string[];
}> {
  // Quality check + clean-up (denoise, contrast, sharpen, threshold) + best-of OCR.
  const result = await ocrBestVariant(buffer);

  return {
    text: limitText(result.text),
    pageData: [
      {
        pageNumber: 1,
        text: result.text,
        method: "ocr",
        confidence: result.confidence,
        quality: { rating: result.quality.rating, issues: result.quality.issues },
        uncertainWords: result.uncertainWords,
      },
    ],
    extractionMethod: "ocr",
    warnings:
      result.text.length === 0
        ? ["No readable text was found in the image. Try a clearer, well-lit photo taken straight on."]
        : result.warnings,
  };
}

async function extractDocx(
  buffer: Buffer
): Promise<{
  text: string;
  pageData: ExtractedPage[];
  extractionMethod: ExtractionMethod;
  warnings: string[];
}> {
  console.log("Extracting DOCX text...");

  const result = await mammoth.extractRawText({
    buffer,
  });

  const text = cleanText(result.value);

  const warnings = result.messages.map(
    (message) => message.message
  );

  /*
   * DOCX does not reliably expose physical page count
   * through raw-text extraction. We therefore treat the
   * extracted document as one logical page for now instead
   * of inventing a page count.
   */
  return {
    text: limitText(text),
    pageData: [
      {
        pageNumber: 1,
        text,
        method: "text",
      },
    ],
    extractionMethod: "text",
    warnings,
  };
}

async function extractPdf(
  buffer: Buffer
): Promise<{
  text: string;
  pageData: ExtractedPage[];
  extractionMethod: ExtractionMethod;
  warnings: string[];
  pages: number;
}> {
  console.log("Extracting PDF text...");

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const textResult = await parser.getText();

  const pages: ExtractedPage[] = textResult.pages.map(
  (page) => ({
    pageNumber: page.num,
    text: cleanText(page.text),
    method: "text",
  })
);

    const pagesNeedingOcr = pages.filter(
      (page) =>
        page.text.replace(/\s/g, "").length <
        OCR_THRESHOLD
    );

    console.log(
      `PDF pages: ${textResult.total}`
    );

    console.log(
      `Pages needing OCR: ${pagesNeedingOcr.length}`
    );

    if (pagesNeedingOcr.length === 0) {
      const combined =
        pages.length > 1
          ? pages.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join("\n\n")
          : pages.map((page) => page.text).filter(Boolean).join("\n\n");

      return {
        text: limitText(combined),
        pageData: pages,
        extractionMethod: "text",
        warnings: [],
        pages: textResult.total,
      };
    }

    console.log(
      "Rendering PDF pages for OCR..."
    );

    // ~2480 px wide is about 300 dpi for an A4 page — what Tesseract reads best.
    const screenshotResult =
      await parser.getScreenshot({
        desiredWidth: 2480,
        imageBuffer: true,
        partial: pagesNeedingOcr.map((page) => page.pageNumber),
      });

    const warnings: string[] = [];

    {
      for (const page of pagesNeedingOcr) {
        const screenshot =
          screenshotResult.pages.find(
            (item) =>
              item.pageNumber ===
              page.pageNumber
          );

        if (!screenshot) {
          continue;
        }

        console.log(
          `OCR page ${page.pageNumber}/${textResult.total}...`
        );

        const ocrResult = await ocrBestVariant(
          Buffer.from(screenshot.data)
        );

        page.text = ocrResult.text || page.text;
        page.method = "ocr";
        page.confidence = ocrResult.confidence;
        page.quality = { rating: ocrResult.quality.rating, issues: ocrResult.quality.issues };
        page.uncertainWords = ocrResult.uncertainWords;

        for (const warning of ocrResult.warnings) {
          const labelled = `Page ${page.pageNumber}: ${warning}`;
          if (!warnings.includes(labelled)) warnings.push(labelled);
        }
      }
    }

    const ocrCount = pages.filter(
      (page) => page.method === "ocr"
    ).length;

    const textCount = pages.filter(
      (page) => page.method === "text"
    ).length;

    const combined = pages
      .map(
        (page) =>
          `[Page ${page.pageNumber}]\n${page.text}`
      )
      .filter(Boolean)
      .join("\n\n");

    let extractionMethod: ExtractionMethod =
      "mixed";

    if (ocrCount === pages.length) {
      extractionMethod = "ocr";
    } else if (textCount === pages.length) {
      extractionMethod = "text";
    }

    return {
      text: limitText(combined),
      pageData: pages,
      extractionMethod,
      warnings: warnings.slice(0, 12),
      pages: textResult.total,
    };
  } finally {
    await parser.destroy();
  }
}

export async function extractDocument(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<ExtractedDocument> {
  if (!buffer || buffer.length === 0) {
    throw new DocumentError(
      "The uploaded file is empty."
    );
  }

  const type = detectFileType(
    originalName,
    mimeType
  );

  if (!type) {
    throw new DocumentError(
      "Unsupported document type. Please upload a PDF, DOCX, PNG, JPG, JPEG, or WEBP file."
    );
  }

  if (
    !validateMagicBytes(buffer, type)
  ) {
    throw new DocumentError(
      "The uploaded file does not appear to be a valid file of the selected type."
    );
  }

  const id =
    `doc-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  let result: {
    text: string;
    pageData: ExtractedPage[];
    extractionMethod: ExtractionMethod;
    warnings: string[];
    pages?: number;
  };

  if (type === "pdf") {
    try {
      result = await extractPdf(buffer);
    } catch (error) {
      if (/password|encrypt/i.test((error as Error).message)) {
        throw new DocumentError("This PDF is password-protected. Please upload an unlocked copy.");
      }
      throw error;
    }
  } else if (type === "docx") {
    result = await extractDocx(buffer);
  } else {
    result = await extractImage(buffer);
  }

  const cleanedText = limitText(
    cleanText(result.text)
  );

  if (!cleanedText) {
    throw new DocumentError(
      "No readable text could be extracted from this document.", 422
    );
  }

  return {
    id,
    name: originalName,
    type,
    size: buffer.length,
    pages:
      result.pages ??
      result.pageData.length,
    extractionMethod:
      result.extractionMethod,
    text: cleanedText,
    pageData: result.pageData,
    warnings: result.warnings,
  };
}