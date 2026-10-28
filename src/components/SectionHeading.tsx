export default function SectionHeading({ title, description, bn = false }: { title: string; description?: string; bn?: boolean }) {
  return (
    <div>
      <h2 className={`section-title ${bn ? "bn" : ""}`}>{title}</h2>
      {description ? <p className={`pt-1 text-[11px] leading-5 text-muted ${bn ? "bn" : ""}`}>{description}</p> : null}
    </div>
  );
}

