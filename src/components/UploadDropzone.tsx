import { FileText, UploadCloud } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useFileDrop } from "../hooks/useFileDrop";

export default function UploadDropzone({ onFile }: { onFile: (file: File) => void }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { inputRef, dragging, choose, onDragOver, onDragLeave, onDrop, onChange } = useFileDrop(onFile);
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`rounded-xl border-2 border-dashed p-10 text-center transition ${dragging ? "border-teal bg-tealSoft" : "border-[#cbd5e1] bg-white"}`}>
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-tealSoft text-teal"><UploadCloud className="size-7" /></div>
      <h2 className={`pt-4 text-[16px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? "আপনার নথি এখানে রাখুন" : "Drop your document here"}</h2>
      <p className={`pt-1.5 text-[11px] text-muted ${bn ? "bn" : ""}`}>{bn ? "অথবা নিচের বোতাম দিয়ে ফাইল নির্বাচন করুন" : "or choose a file using the button below"}</p>
      <button type="button" onClick={choose} className="primary-btn mt-4"><FileText className="mr-1.5 size-3.5" />{bn ? "ফাইল বাছাই করুন" : "Choose File"}</button>
      <input ref={inputRef} hidden type="file" accept=".pdf,.doc,.docx,.txt,image/*" onChange={onChange} />
      <p className="pt-4 text-[9px] text-muted">PDF · DOC · DOCX · JPG · PNG · TXT</p>
    </div>
  );
}

