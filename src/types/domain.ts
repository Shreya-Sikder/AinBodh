export type FindingLevel = "high" | "review" | "info";

export type EvidenceReference = {
  id: string;
  page: number;
  section?: string;
  label: string;
  excerpt?: string;
};

export type KeyPoint = {
  id: string;
  label: string;
  value: string;
  icon: string;
  referenceIds?: string[];
};

export type AttentionFinding = {
  id: string;
  level: FindingLevel;
  title: string;
  explanation: string;
  references: string[];
  recommendation?: string;
};

export type MissingFinding = {
  id: string;
  title: string;
  explanation: string;
  category: "missing" | "unclear";
};

export type ContradictionFinding = {
  id: string;
  title: string;
  firstStatement: string;
  secondStatement: string;
  references: string[];
  severity: "possible" | "review";
};

export type LegalTerm = {
  id: string;
  term: string;
  simpleExplanation: string;
  documentExplanation: string;
  reference: string;
};

export type AnalysisModel = {
  documentId: string;
  overview: string;
  keyPoints: KeyPoint[];
  attention: AttentionFinding[];
  missing: MissingFinding[];
  contradictions: ContradictionFinding[];
  terms: LegalTerm[];
};

