import type { ReactNode } from "react";
import type { ChatCitation } from "../../context/AppContext";
import { CitationPill } from "./Citations";

/*
 * Renders the answer like a chat message: "### " headings (with the emoji the
 * answer starts them with), numbered and bulleted lists, **bold**, links, and
 * [C1] citation markers as source pills. Nothing is rendered as raw HTML.
 */

type Props = { text: string; citations?: ChatCitation[]; bn: boolean; dark: boolean };

const NUMBERED = /^\s*([0-9০-৯]{1,3})[.)।]\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;

function inline(text: string, citations: ChatCitation[], bn: boolean, dark: boolean, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Consecutive markers like "[C1][C2]" or "[C1, C2]" become one pill.
  const parts = text.split(/((?:\s?\[C\d+(?:\s*,\s*C\d+)*\])+)/g);
  parts.forEach((part, index) => {
    if (!part) return;
    if (/^(\s?\[C\d+(?:\s*,\s*C\d+)*\])+$/.test(part)) {
      const ids = Array.from(part.matchAll(/C\d+/g), (match) => match[0]);
      const found = ids.map((id) => citations.find((item) => item.id === id)).filter((item): item is ChatCitation => Boolean(item));
      if (found.length) out.push(<CitationPill key={`${key}-c${index}`} citations={found} bn={bn} dark={dark} />);
      return;
    }
    part.split(/(\*\*[^*\n]+\*\*|https?:\/\/[^\s)]+)/g).forEach((piece, j) => {
      if (!piece) return;
      if (/^\*\*[^*\n]+\*\*$/.test(piece)) {
        out.push(
          <strong key={`${key}-${index}-${j}`} className={dark ? "text-white" : "text-[#172033]"}>
            {piece.slice(2, -2)}
          </strong>,
        );
      } else if (/^https?:\/\//.test(piece)) {
        out.push(
          <a key={`${key}-${index}-${j}`} href={piece} target="_blank" rel="noopener noreferrer" className="break-all text-teal underline underline-offset-2">
            {piece}
          </a>,
        );
      } else {
        out.push(<span key={`${key}-${index}-${j}`}>{piece}</span>);
      }
    });
  });
  return out;
}

export default function Markdown({ text, citations = [], bn, dark }: Props) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ol" | "ul"; items: Array<{ text: string; number?: string }> } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const key = `p${blocks.length}`;
    blocks.push(
      <p key={key} className="my-2 first:mt-0 last:mb-0">
        {paragraph.map((line, index) => (
          <span key={index}>
            {index > 0 && <br />}
            {inline(line, citations, bn, dark, `${key}-${index}`)}
          </span>
        ))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const key = `l${blocks.length}`;
    const items = list.items.map((item, index) => (
      <li key={index} className="pl-1">
        {inline(item.text, citations, bn, dark, `${key}-${index}`)}
      </li>
    ));
    blocks.push(
      list.kind === "ol" ? (
        <ol key={key} className="my-2 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-teal">
          {items}
        </ol>
      ) : (
        <ul key={key} className="my-2 list-disc space-y-1.5 pl-6 marker:text-teal">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(HEADING);
    const numbered = line.match(NUMBERED);
    const bullet = line.match(BULLET);

    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <h4 key={`h${blocks.length}`} className={`mb-1.5 mt-4 text-[14px] font-bold first:mt-0 ${dark ? "text-white" : "text-[#172033]"}`}>
          {inline(heading[1].replace(/\*\*/g, ""), citations, bn, dark, `h${blocks.length}`)}
        </h4>,
      );
    } else if (numbered) {
      flushParagraph();
      if (list?.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push({ text: numbered[2], number: numbered[1] });
    } else if (bullet) {
      flushParagraph();
      if (list?.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push({ text: bullet[1] });
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // Continuation of a list item.
      list.items[list.items.length - 1].text += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div className="leading-7">{blocks}</div>;
}
