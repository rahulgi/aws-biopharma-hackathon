export const SOURCE_CATEGORIES = [
  "DRUG_LABEL",
  "PHASE_3_RESULTS",
  "MEDICAL_INFORMATION",
  "CLINICAL_GUIDELINE",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export type ApprovedSource = {
  url: string;
  category: SourceCategory;
};

export type AgentInput = {
  drug: string;
  indication: string;
  approved_sources?: ApprovedSource[];
  medical_information_question?: string;
};

export type SpanStatus = "running" | "done" | "error";

export type TraceSpan = {
  id: string;
  nodeId: string;
  parentId?: string;
  label: string;
  kind: "code" | "trigger" | "llm" | "data" | "action";
  startMs: number;
  durMs: number;
  status: SpanStatus;
  cost?: number;
  providerRequestId?: string;
  providerExecutionStarted?: boolean;
  providerExecutionEndMs?: number;
};

export type RunArtifact = {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentBase64: string;
  id?: string;
  name?: string;
};

export type GroundedReportRef = {
  kind: "grounded_report";
  requestId: string;
};

export type AgentRunResult = {
  status: "success" | "error";
  output: string | Record<string, unknown>;
  durationMs: number;
  costUsd: number;
  graph?: unknown;
  controlFlow?: unknown;
  trace?: TraceSpan[];
  artifacts?: RunArtifact[];
  artifactsDropped?: number;
  agentVersionId?: string;
  versionLabel?: string;
};

export type ApprovedContentOutput = {
  medicalInformationReport: GroundedReportRef | null;
  medicalInformationText: string;
  medicalInformationDocumentFilename: string;
  medicalInformationPopulatedSectionCount: number;
  mslReport: GroundedReportRef | null;
  mslText: string;
  salesReport: GroundedReportRef | null;
  salesText: string;
  sourceMode: "CALLER_SUPPLIED" | "DISCOVERED_CANDIDATES" | "UNKNOWN";
  sourceCount: number;
  sourceTitles: string[];
  sourceUrls: string[];
  sourceCategories: SourceCategory[];
  missingSourceCategories: SourceCategory[];
  sourceResolutionNotes: string[];
  verifiedSnippetCount: number;
  raw: Record<string, unknown>;
};

function parseJsonLike(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(unfenced);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const numberValue = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const groundedReportRef = (value: unknown): GroundedReportRef | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "grounded_report" &&
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0
    ? { kind: "grounded_report", requestId: candidate.requestId }
    : null;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const categoryArray = (value: unknown): SourceCategory[] =>
  stringArray(value).filter((item): item is SourceCategory =>
    SOURCE_CATEGORIES.includes(item as SourceCategory),
  );

/**
 * Read the agent's current structured output without making the UI depend on
 * Zod's serialized field order or on report-reference fields it doesn't render.
 */
export function parseApprovedContentOutput(
  value: unknown,
): ApprovedContentOutput | null {
  const raw = parseJsonLike(value);
  if (!raw) return null;

  const sourceMode =
    raw.SOURCE_MODE === "CALLER_SUPPLIED" ||
    raw.SOURCE_MODE === "DISCOVERED_CANDIDATES"
      ? raw.SOURCE_MODE
      : "UNKNOWN";

  return {
    medicalInformationReport: groundedReportRef(
      raw.MEDICAL_INFORMATION_CONTENT_PLAN ??
        raw.MEDICAL_INFORMATION_ANALYSIS,
    ),
    medicalInformationText: stringValue(
      raw.MEDICAL_INFORMATION_CONTENT_PLAN_TEXT ??
        raw.MEDICAL_INFORMATION_ANALYSIS_TEXT,
    ),
    medicalInformationDocumentFilename: stringValue(
      raw.MEDICAL_INFORMATION_DOCUMENT_FILENAME,
    ),
    medicalInformationPopulatedSectionCount: numberValue(
      raw.MEDICAL_INFORMATION_POPULATED_SECTION_COUNT,
    ),
    mslReport: groundedReportRef(raw.MSL_ANALYSIS),
    mslText: stringValue(raw.MSL_ANALYSIS_TEXT),
    salesReport: groundedReportRef(raw.SALES_ANALYSIS),
    salesText: stringValue(raw.SALES_ANALYSIS_TEXT),
    sourceMode,
    sourceCount: numberValue(raw.SOURCE_COUNT),
    sourceTitles: stringArray(raw.SOURCE_TITLES),
    sourceUrls: stringArray(raw.SOURCE_URLS),
    sourceCategories: categoryArray(raw.SOURCE_CATEGORIES),
    missingSourceCategories: categoryArray(raw.MISSING_SOURCE_CATEGORIES),
    sourceResolutionNotes: stringArray(raw.SOURCE_RESOLUTION_NOTES),
    verifiedSnippetCount: numberValue(raw.VERIFIED_SNIPPET_COUNT),
    raw,
  };
}

export function upsertSpan(spans: TraceSpan[], span: TraceSpan): TraceSpan[] {
  const index = spans.findIndex((candidate) => candidate.id === span.id);
  if (index === -1) return [...spans, span];
  const next = [...spans];
  next[index] = span;
  return next;
}
