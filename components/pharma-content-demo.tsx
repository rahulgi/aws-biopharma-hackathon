"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon, type IconName } from "./icon";
import { BrandLogoStrip } from "./brand-logos";
import { GroundedOutline } from "./grounded-outline";
import { MarkdownDocument } from "./markdown-document";
import {
  artifactByFilename,
  parseApprovedContentOutput,
  upsertSpan,
  type AgentInput,
  type AgentRunResult,
  type ApprovedContentOutput,
  type RunArtifact,
  type SourceCategory,
  type TraceSpan,
} from "@/lib/agent";
import {
  DRUG_PRESETS,
  filterDrugPresets,
  presetToInput,
  type DrugPreset,
} from "@/lib/catalog";
import {
  readRunHistory,
  saveRunToHistory,
  type SavedAgentRun,
} from "@/lib/run-history";
import { consumeSse } from "@/lib/sse";

type RunPhase = "idle" | "running" | "success" | "error";
type AudienceKey = "medical" | "msl" | "sales";
type DeliverableView = "grounded" | "clean";
type StageState = "pending" | "running" | "done" | "error";

type StageDefinition = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  nodeIds: string[];
};

const STAGES: StageDefinition[] = [
  {
    id: "sources",
    eyebrow: "01 · Resolve",
    title: "Source corpus",
    description: "Resolve and hydrate the retained source set.",
    icon: "database",
    nodeIds: ["nodes/discoverSources", "nodes/hydrateSources"],
  },
  {
    id: "evidence",
    eyebrow: "02 · Ground",
    title: "Shared evidence",
    description: "Extract one verified snippet corpus for every audience.",
    icon: "layers",
    nodeIds: ["nodes/extractSharedSnippets"],
  },
  {
    id: "medical",
    eyebrow: "03A · Adapt",
    title: "Medical Affairs",
    description: "Build the cited Medical Information response plan.",
    icon: "flask",
    nodeIds: [
      "nodes/buildMedicalInformation",
      "nodes/analyzeMedicalInformation",
    ],
  },
  {
    id: "msl",
    eyebrow: "03B · Adapt",
    title: "MSL field exchange",
    description: "Shape the scientific narrative and discussion prompts.",
    icon: "users",
    nodeIds: ["nodes/analyzeMsl"],
  },
  {
    id: "sales",
    eyebrow: "03C · Adapt",
    title: "Sales planning",
    description: "Separate supportable claims, fair balance, and gaps.",
    icon: "file",
    nodeIds: ["nodes/analyzeSales"],
  },
  {
    id: "document",
    eyebrow: "04 · Package",
    title: "Review document",
    description: "Populate the fixed template and save the handoff file.",
    icon: "shield",
    nodeIds: [
      "nodes/populateMedicalInformationTemplate",
      "nodes/saveMedicalInformationDocument",
    ],
  },
];

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  DRUG_LABEL: "Drug label",
  PHASE_3_RESULTS: "Clinical results",
  MEDICAL_INFORMATION: "Medical Information",
  CLINICAL_GUIDELINE: "Clinical guideline",
};

const audienceTabs: Array<{
  id: AudienceKey;
  label: string;
  kicker: string;
  icon: IconName;
}> = [
  {
    id: "medical",
    label: "Medical Affairs",
    kicker: "Scientific response plan",
    icon: "flask",
  },
  {
    id: "msl",
    label: "MSLs",
    kicker: "Field scientific exchange",
    icon: "users",
  },
  {
    id: "sales",
    label: "Sales",
    kicker: "Governed content plan",
    icon: "file",
  },
];

function stageState(spans: TraceSpan[], stage: StageDefinition): StageState {
  const matching = spans.filter((span) => stage.nodeIds.includes(span.nodeId));
  if (matching.some((span) => span.status === "error")) return "error";
  if (matching.some((span) => span.status === "running")) return "running";
  if (matching.some((span) => span.status === "done")) return "done";
  return "pending";
}

function stageDetail(spans: TraceSpan[], stage: StageDefinition): string {
  const matching = spans.filter((span) => stage.nodeIds.includes(span.nodeId));
  const active = [...matching]
    .reverse()
    .find((span) => span.status === "running");
  if (active) return active.label;
  const errored = [...matching]
    .reverse()
    .find((span) => span.status === "error");
  if (errored) return `${errored.label} needs attention`;
  const done = [...matching].reverse().find((span) => span.status === "done");
  if (done) return `${done.label} · ${formatDuration(done.durMs)}`;
  return stage.description;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.max(0, Math.round(durationMs))}ms`;
  const seconds = Math.round(durationMs / 100) / 10;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}

function formatClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved run";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  downloadBlob(filename, blob);
}

function artifactBlob(artifact: RunArtifact): Blob {
  const binary = window.atob(artifact.contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: artifact.contentType });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function openArtifact(artifact: RunArtifact) {
  const url = URL.createObjectURL(artifactBlob(artifact));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function StatusGlyph({ state }: { state: StageState }) {
  if (state === "running") return <span className="status-spinner" />;
  if (state === "done") {
    return (
      <span className="status-check">
        <Icon name="check" size={13} />
      </span>
    );
  }
  if (state === "error") return <span className="status-error">!</span>;
  return <span className="status-pending" />;
}

function StageCard({
  stage,
  spans,
  compact = false,
}: {
  stage: StageDefinition;
  spans: TraceSpan[];
  compact?: boolean;
}) {
  const state = stageState(spans, stage);
  return (
    <article
      className={`stage-card stage-${state}${compact ? " compact" : ""}`}
    >
      <div className="stage-card-topline">
        <span className="stage-icon">
          <Icon name={stage.icon} size={17} />
        </span>
        <StatusGlyph state={state} />
      </div>
      <span className="stage-eyebrow">{stage.eyebrow}</span>
      <h3>{stage.title}</h3>
      <p>{stageDetail(spans, stage)}</p>
      {state === "running" && <span className="stage-progress-line" />}
    </article>
  );
}

function DrugCombobox({
  value,
  onChange,
  onSelect,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (preset: DrugPreset) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => filterDrugPresets(value), [value]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="combobox" ref={rootRef}>
      <div className="input-shell">
        <Icon name="search" size={19} />
        <input
          aria-autocomplete="list"
          aria-controls="drug-options"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) =>
                Math.min(index + 1, Math.max(options.length - 1, 0)),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && open && options[activeIndex]) {
              event.preventDefault();
              onSelect(options[activeIndex]);
              setOpen(false);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search a brand or generic name"
          role="combobox"
          value={value}
        />
        <Icon name="chevron" size={17} />
      </div>
      {open && options.length > 0 && !disabled && (
        <div className="combobox-menu" id="drug-options" role="listbox">
          {options.map((preset, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              key={preset.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(preset);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>
                <strong>{preset.drug}</strong>
                <small>{preset.indication}</small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PharmaContentDemo() {
  const initialPreset = DRUG_PRESETS[0];
  const initialInput = presetToInput(initialPreset);
  const [drug, setDrug] = useState(initialInput.drug);
  const [indication, setIndication] = useState(initialInput.indication);
  const [question, setQuestion] = useState(
    initialInput.medical_information_question ?? "",
  );
  const [selectedPreset, setSelectedPreset] =
    useState<DrugPreset>(initialPreset);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [runResult, setRunResult] = useState<AgentRunResult | null>(null);
  const [output, setOutput] = useState<ApprovedContentOutput | null>(null);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [error, setError] = useState("");
  const [runId, setRunId] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [executedInput, setExecutedInput] = useState<AgentInput | null>(null);
  const [runHistory, setRunHistory] = useState<SavedAgentRun[]>([]);
  const [historyNotice, setHistoryNotice] = useState("");
  const [activeAudience, setActiveAudience] = useState<AudienceKey>("medical");
  const [deliverableView, setDeliverableView] =
    useState<DeliverableView>("grounded");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<AgentRunResult | null>(null);
  const errorRef = useRef("");
  const runHistoryRef = useRef<SavedAgentRun[]>([]);

  const input = useMemo<AgentInput>(() => {
    const usePresetSources = selectedPreset?.drug === drug;
    return {
      drug: drug.trim(),
      indication: indication.trim(),
      ...(question.trim()
        ? { medical_information_question: question.trim() }
        : {}),
      ...(usePresetSources && selectedPreset.approvedSources?.length
        ? { approved_sources: selectedPreset.approvedSources }
        : {}),
    };
  }, [drug, indication, question, selectedPreset]);
  const activeInput = executedInput ?? input;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedRuns = readRunHistory(window.localStorage);
        runHistoryRef.current = savedRuns;
        setRunHistory(savedRuns);
      } catch {
        // Browser privacy settings can disable local storage entirely.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (phase !== "running" || startedAt === null) return;
    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    resultRef.current = null;
    errorRef.current = "";
    setPhase("idle");
    setSpans([]);
    setRunResult(null);
    setOutput(null);
    setStreamedOutput("");
    setError("");
    setRunId("");
    setIsPreview(false);
    setExecutedInput(null);
    setHistoryNotice("");
    setStartedAt(null);
    setElapsed(0);
    setActiveAudience("medical");
    setDeliverableView("grounded");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const selectPreset = (preset: DrugPreset) => {
    const next = presetToInput(preset);
    setSelectedPreset(preset);
    setDrug(next.drug);
    setIndication(next.indication);
    setQuestion(next.medical_information_question ?? "");
  };

  const setFormInput = (nextInput: AgentInput) => {
    const matchingPreset = DRUG_PRESETS.find(
      (preset) => preset.drug === nextInput.drug,
    );
    setSelectedPreset(matchingPreset ?? initialPreset);
    setDrug(nextInput.drug);
    setIndication(nextInput.indication);
    setQuestion(nextInput.medical_information_question ?? "");
  };

  const startRun = async (requestedInput: AgentInput = input) => {
    if (
      !requestedInput.drug ||
      !requestedInput.indication ||
      phase === "running"
    ) {
      return;
    }
    const controller = new AbortController();
    let responseRunId = "";
    let previewRun = false;
    controllerRef.current = controller;
    resultRef.current = null;
    errorRef.current = "";
    setFormInput(requestedInput);
    setExecutedInput(requestedInput);
    setPhase("running");
    setSpans([]);
    setRunResult(null);
    setOutput(null);
    setStreamedOutput("");
    setError("");
    setRunId("");
    setIsPreview(false);
    setHistoryNotice("");
    setStartedAt(Date.now());
    setElapsed(0);

    window.setTimeout(() => {
      document
        .getElementById("live-work")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestedInput),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "The analysis could not start.");
      }
      if (!response.body) throw new Error("The run stream was empty.");
      if (response.headers.get("x-demo-preview") === "true") {
        previewRun = true;
        setIsPreview(true);
      }

      await consumeSse(response.body, ({ event, data }) => {
        const payload =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : {};
        if (event === "start") {
          if (typeof payload.runId === "string") {
            responseRunId = payload.runId;
            setRunId(payload.runId);
          }
          if (payload.preview === true) {
            previewRun = true;
            setIsPreview(true);
          }
        }
        if (
          event === "span" &&
          typeof payload.id === "string" &&
          typeof payload.nodeId === "string"
        ) {
          setSpans((current) => upsertSpan(current, payload as TraceSpan));
        }
        if (event === "output" && typeof payload.text === "string") {
          setStreamedOutput((current) => current + payload.text);
        }
        if (event === "result") {
          const result = payload as unknown as AgentRunResult;
          resultRef.current = result;
          setRunResult(result);
          if (Array.isArray(result.trace)) setSpans(result.trace);
          const parsed = parseApprovedContentOutput(result.output);
          setOutput(parsed);
          if (result.status === "error") {
            const message =
              typeof result.output === "string"
                ? result.output
                : "The agent returned an incomplete run.";
            errorRef.current = message;
            setError(message);
          }
        }
        if (event === "error") {
          const message =
            typeof payload.message === "string"
              ? payload.message
              : "The agent run was interrupted.";
          errorRef.current = message;
          setError(message);
        }
      });

      const settledResult = resultRef.current as AgentRunResult | null;
      if (errorRef.current || settledResult?.status === "error") {
        setPhase("error");
      } else if (settledResult) {
        setPhase("success");
        const savedAt = new Date().toISOString();
        let saved = { history: runHistoryRef.current, saved: false };
        try {
          saved = saveRunToHistory(
            window.localStorage,
            {
              id:
                responseRunId ||
                `${savedAt}-${settledResult.agentVersionId ?? "run"}`,
              savedAt,
              runId: responseRunId,
              input: requestedInput,
              result: settledResult,
              isPreview: previewRun,
            },
            runHistoryRef.current,
          );
        } catch {
          // Keep the completed result visible when storage is unavailable.
        }
        runHistoryRef.current = saved.history;
        setRunHistory(saved.history);
        setHistoryNotice(
          saved.saved
            ? "Saved in this browser"
            : "This result was too large for browser history",
        );
      } else {
        throw new Error("The run ended before a result was returned.");
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error
          ? caught.message
          : "The analysis could not be completed.";
      errorRef.current = message;
      setError(message);
      setPhase("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setElapsed((current) =>
        startedAt === null ? current : Date.now() - startedAt,
      );
    }
  };

  const restoreSavedRun = (saved: SavedAgentRun) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    resultRef.current = saved.result;
    errorRef.current = "";
    setFormInput(saved.input);
    setExecutedInput(saved.input);
    setPhase("success");
    setSpans(saved.result.trace ?? []);
    setRunResult(saved.result);
    setOutput(parseApprovedContentOutput(saved.result.output));
    setStreamedOutput("");
    setError("");
    setRunId(saved.runId);
    setIsPreview(saved.isPreview);
    setStartedAt(null);
    setElapsed(saved.result.durationMs);
    setHistoryNotice(`Restored from ${formatSavedAt(saved.savedAt)}`);
    setActiveAudience("medical");
    setDeliverableView("grounded");
    window.setTimeout(() => {
      document
        .getElementById("live-work")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const selectedText =
    activeAudience === "medical"
      ? (output?.medicalInformationText ?? "")
      : activeAudience === "msl"
        ? (output?.mslText ?? "")
        : (output?.salesText ?? "");
  const selectedAudience = audienceTabs.find(
    (audience) => audience.id === activeAudience,
  )!;
  const selectedReport =
    activeAudience === "medical"
      ? output?.medicalInformationReport
      : activeAudience === "msl"
        ? output?.mslReport
        : output?.salesReport;
  const fullEvidenceUrl = selectedReport
    ? `https://www.cemented.ai/v3/research/${encodeURIComponent(selectedReport.requestId)}`
    : null;
  const selectedDocumentFilename =
    activeAudience === "medical"
      ? (output?.medicalInformationDocumentFilename ?? "")
      : activeAudience === "msl"
        ? (output?.mslDocumentFilename ?? "")
        : (output?.salesDocumentFilename ?? "");
  const selectedArtifact = artifactByFilename(
    runResult?.artifacts,
    selectedDocumentFilename,
  );

  const sourceRegister = useMemo(() => {
    const urls = output?.sourceUrls.length
      ? output.sourceUrls
      : (activeInput.approved_sources?.map((source) => source.url) ?? []);
    const categories = output?.sourceCategories.length
      ? output.sourceCategories
      : (activeInput.approved_sources?.map((source) => source.category) ?? []);
    const count = Math.max(
      output?.sourceCount ?? 0,
      urls.length,
      output?.sourceTitles.length ?? 0,
    );
    return Array.from({ length: count }, (_, index) => ({
      title:
        output?.sourceTitles[index] ||
        (urls[index] ? safeHostname(urls[index]) : `Source ${index + 1}`),
      url: urls[index] ?? "",
      category: categories[index],
    }));
  }, [activeInput.approved_sources, output]);

  const isLiveSurface = phase !== "idle";
  const finalDuration = runResult?.durationMs ?? elapsed;
  const completedStageCount = STAGES.filter(
    (stage) => stageState(spans, stage) === "done",
  ).length;

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Slipstream home">
          <BrandMark />
          <span>
            Slipstream <small>Pharma evidence repackaging</small>
          </span>
        </a>
        <div className="header-meta">
          <span className="agent-status">
            <i /> Published v3 agent
          </span>
        </div>
      </header>

      <div id="top" />
      <section className={`hero ${isLiveSurface ? "hero-compact" : ""}`}>
        <div className="hero-copy">
          <span className="eyebrow-label">
            <Icon name="spark" size={15} /> One evidence base
          </span>
          <h1>
            One source set.
            <br />
            <em>Three teams, aligned.</em>
          </h1>
          <p>
            Turn an approved pharmaceutical evidence corpus into cited drafts
            for Medical Affairs, MSLs, and Sales. Every output keeps its source
            trail.
          </p>
          {!isLiveSurface && (
            <div className="hero-proof">
              <span>
                <Icon name="database" size={18} /> One ingestion
              </span>
              <span>
                <Icon name="activity" size={18} /> Live execution trace
              </span>
              <span>
                <Icon name="shield" size={18} /> Review-ready provenance
              </span>
            </div>
          )}
        </div>

        {!isLiveSurface ? (
          <form
            className="run-form"
            onSubmit={(event) => {
              event.preventDefault();
              void startRun();
            }}
          >
            <div className="form-heading">
              <span>Start with a product</span>
              <small>Demo input</small>
            </div>
            <label htmlFor="drug">Drug</label>
            <DrugCombobox
              disabled={false}
              onChange={(value) => {
                setDrug(value);
                if (value !== selectedPreset.drug) {
                  setSelectedPreset(
                    DRUG_PRESETS.find((preset) => preset.drug === value) ??
                      selectedPreset,
                  );
                }
              }}
              onSelect={selectPreset}
              value={drug}
            />
            <label htmlFor="indication">Indication or use</label>
            <input
              className="text-input"
              id="indication"
              onChange={(event) => setIndication(event.target.value)}
              placeholder="Enter the disease, population, or use"
              value={indication}
            />
            <details className="question-details">
              <summary>
                Medical Information question <span>Optional</span>
              </summary>
              <textarea
                aria-label="Medical Information question"
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                value={question}
              />
            </details>

            <div
              className={`source-mode-callout ${input.approved_sources?.length ? "approved" : "candidate"}`}
            >
              <span className="source-mode-icon">
                <Icon
                  name={input.approved_sources?.length ? "shield" : "search"}
                  size={18}
                />
              </span>
              <span>
                <strong>
                  {input.approved_sources?.length
                    ? `${input.approved_sources.length} nominated sources`
                    : "Candidate source discovery"}
                </strong>
                <small>
                  {input.approved_sources?.length
                    ? "The agent keeps this URL set closed."
                    : "Discovered sources require approval before production use."}
                </small>
              </span>
            </div>

            <button
              className="primary-button"
              disabled={!input.drug || !input.indication}
              type="submit"
            >
              Build cited content <Icon name="arrow" size={18} />
            </button>
            <p className="form-footnote">
              Runs the published agent. Typical analyses take several minutes.
            </p>
          </form>
        ) : (
          <aside className="active-run-summary">
            <span className="active-run-label">
              {phase === "running" ? "Analysis in progress" : "Analysis run"}
            </span>
            <h2>{activeInput.drug}</h2>
            <p>{activeInput.indication}</p>
            <div className="active-run-metrics">
              <span>{formatClock(finalDuration)}</span>
              <span>
                {completedStageCount}/{STAGES.length} stages
              </span>
              {runId && <span>Run {runId.slice(0, 8)}</span>}
            </div>
            {historyNotice && (
              <p className="history-notice">
                <Icon name="database" size={14} /> {historyNotice}
              </p>
            )}
            <div className="active-run-actions">
              <button
                className="secondary-button"
                onClick={reset}
                type="button"
              >
                New analysis
              </button>
              {phase !== "running" && (
                <button
                  className="rerun-button"
                  onClick={() => void startRun(activeInput)}
                  type="button"
                >
                  <Icon name="refresh" size={16} /> Run against latest agent
                </button>
              )}
            </div>
          </aside>
        )}
      </section>

      {phase === "idle" && runHistory.length > 0 && (
        <section className="history-section" aria-labelledby="run-history">
          <div className="history-heading">
            <div>
              <span className="section-kicker">Saved on this browser</span>
              <h2 id="run-history">Previous analyses</h2>
            </div>
            <p>
              View a saved result without spending another run, or submit its
              input to the latest published agent.
            </p>
          </div>
          <div className="history-list">
            {runHistory.map((saved) => (
              <article className="history-row" key={saved.id}>
                <span className="history-icon">
                  <Icon name="file" size={18} />
                </span>
                <div className="history-copy">
                  <h3>{saved.input.drug}</h3>
                  <p>{saved.input.indication}</p>
                  <span>
                    {formatSavedAt(saved.savedAt)} ·{" "}
                    {formatDuration(saved.result.durationMs)}
                    {saved.result.versionLabel
                      ? ` · ${saved.result.versionLabel}`
                      : ""}
                    {saved.isPreview ? " · Preview" : ""}
                  </span>
                </div>
                <div className="history-actions">
                  <button
                    className="secondary-button"
                    onClick={() => restoreSavedRun(saved)}
                    type="button"
                  >
                    View saved result
                  </button>
                  <button
                    className="rerun-button"
                    onClick={() => void startRun(saved.input)}
                    type="button"
                  >
                    <Icon name="refresh" size={15} /> Run latest
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isLiveSurface && (
        <>
          <section className="work-section" id="live-work">
            <div className="section-heading-row">
              <div>
                <span className="section-kicker">
                  {phase === "running"
                    ? "Live agent trace"
                    : "Execution record"}
                </span>
                <h2>
                  {phase === "running"
                    ? "Watch the work happen"
                    : "How the drafts were built"}
                </h2>
              </div>
              <div className={`run-state-pill state-${phase}`}>
                {phase === "running" && <span className="status-spinner" />}
                {phase === "success" && <Icon name="check" size={14} />}
                {phase === "error" && <span>!</span>}
                {phase === "running"
                  ? `Running · ${formatClock(elapsed)}`
                  : phase === "success"
                    ? `Complete · ${formatDuration(finalDuration)}`
                    : "Run needs attention"}
              </div>
            </div>

            {isPreview && (
              <div className="preview-banner">
                <strong>Interface preview</strong>
                <span>
                  This trace uses local sample events. Set a Cemented API token
                  to run the published agent.
                </span>
              </div>
            )}

            <div className="flow-board">
              <StageCard stage={STAGES[0]} spans={spans} />
              <span className="flow-arrow">
                <Icon name="arrow" size={19} />
              </span>
              <StageCard stage={STAGES[1]} spans={spans} />
              <span className="flow-arrow branch-arrow">
                <Icon name="arrow" size={19} />
              </span>
              <div className="audience-branch">
                <span className="branch-bracket" />
                {STAGES.slice(2, 5).map((stage) => (
                  <StageCard
                    compact
                    key={stage.id}
                    stage={stage}
                    spans={spans}
                  />
                ))}
              </div>
              <span className="flow-arrow">
                <Icon name="arrow" size={19} />
              </span>
              <StageCard stage={STAGES[5]} spans={spans} />
            </div>

            {spans.length > 0 && (
              <div className="trace-ticker">
                <span className="ticker-label">Latest activity</span>
                {[...spans]
                  .sort((a, b) => b.startMs - a.startMs)
                  .slice(0, 4)
                  .map((span) => (
                    <span className="ticker-event" key={span.id}>
                      <i className={`ticker-${span.status}`} />
                      {span.label}
                      <small>
                        {span.status === "running"
                          ? "running"
                          : formatDuration(span.durMs)}
                      </small>
                    </span>
                  ))}
              </div>
            )}
          </section>

          {phase === "error" && (
            <section className="error-panel">
              <span className="error-icon">!</span>
              <div>
                <span className="section-kicker">Partial run retained</span>
                <h2>The run stopped before every deliverable was ready.</h2>
                <p>{error || "The agent returned an incomplete run."}</p>
                {streamedOutput && <pre>{streamedOutput}</pre>}
              </div>
              <button
                className="secondary-button"
                onClick={reset}
                type="button"
              >
                Try another input
              </button>
            </section>
          )}

          {phase === "success" && output && (
            <>
              <section className="result-overview">
                <div className="result-intro">
                  <span className="section-kicker">Shared source register</span>
                  <h2>One corpus under every draft</h2>
                  <p>
                    The same verified snippet set informed each audience
                    analysis. Source categories remain distinct through review.
                  </p>
                </div>
                <div className="metric-grid">
                  <article>
                    <span>Source mode</span>
                    <strong>
                      {output.sourceMode === "CALLER_SUPPLIED"
                        ? "Nominated set"
                        : "Candidates"}
                    </strong>
                  </article>
                  <article>
                    <span>Sources retained</span>
                    <strong>{output.sourceCount}</strong>
                  </article>
                  <article>
                    <span>Verified passages</span>
                    <strong>{output.verifiedSnippetCount}</strong>
                  </article>
                  <article>
                    <span>Run duration</span>
                    <strong>{formatDuration(finalDuration)}</strong>
                  </article>
                </div>
              </section>

              <section className="deliverables-section">
                <div className="section-heading-row">
                  <div>
                    <span className="section-kicker">
                      Audience deliverables
                    </span>
                    <h2>Three drafts from the same evidence</h2>
                  </div>
                  {selectedArtifact && (
                    <button
                      className="artifact-button"
                      onClick={() => openArtifact(selectedArtifact)}
                      type="button"
                    >
                      <Icon name="external" size={16} /> Open formatted{" "}
                      {selectedAudience.label} document
                    </button>
                  )}
                </div>

                <div className="deliverable-layout">
                  <nav className="audience-tabs" aria-label="Audience drafts">
                    {audienceTabs.map((audience) => (
                      <button
                        aria-current={
                          activeAudience === audience.id ? "page" : undefined
                        }
                        className={
                          activeAudience === audience.id ? "active" : ""
                        }
                        key={audience.id}
                        onClick={() => {
                          setActiveAudience(audience.id);
                          setDeliverableView("grounded");
                        }}
                        type="button"
                      >
                        <span className="tab-icon">
                          <Icon name={audience.icon} size={18} />
                        </span>
                        <span>
                          <strong>{audience.label}</strong>
                          <small>{audience.kicker}</small>
                        </span>
                        <Icon name="arrow" size={16} />
                      </button>
                    ))}
                  </nav>

                  <article className="document-card">
                    <header>
                      <div>
                        <span className="document-audience">
                          <Icon name={selectedAudience.icon} size={16} />
                          {selectedAudience.label}
                        </span>
                        <h3>{selectedAudience.kicker}</h3>
                      </div>
                      <div className="document-actions">
                        <div
                          aria-label="Deliverable view"
                          className="document-view-toggle"
                          role="group"
                        >
                          <button
                            aria-pressed={deliverableView === "grounded"}
                            className={
                              deliverableView === "grounded" ? "active" : ""
                            }
                            onClick={() => setDeliverableView("grounded")}
                            type="button"
                          >
                            Grounded outline
                          </button>
                          <button
                            aria-pressed={deliverableView === "clean"}
                            className={
                              deliverableView === "clean" ? "active" : ""
                            }
                            onClick={() => setDeliverableView("clean")}
                            type="button"
                          >
                            Clean draft
                          </button>
                        </div>
                        {deliverableView === "grounded" &&
                          fullEvidenceUrl &&
                          !isPreview && (
                            <a
                              className="evidence-link"
                              href={fullEvidenceUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Full evidence <Icon name="external" size={14} />
                            </a>
                          )}
                        <button
                          aria-label={`Download ${selectedAudience.label} draft`}
                          className="icon-button"
                          onClick={() =>
                            downloadText(
                              `${activeInput.drug
                                .toLowerCase()
                                .replace(
                                  /[^a-z0-9]+/g,
                                  "-",
                                )}-${activeAudience}.md`,
                              selectedText,
                            )
                          }
                          type="button"
                        >
                          <Icon name="download" size={17} />
                        </button>
                      </div>
                    </header>
                    <div className="document-scroll">
                      {deliverableView === "grounded" && selectedReport ? (
                        <GroundedOutline
                          content={selectedText}
                          requestId={selectedReport.requestId}
                        />
                      ) : (
                        <MarkdownDocument content={selectedText} />
                      )}
                    </div>
                  </article>
                </div>
              </section>

              <section className="sources-section">
                <div className="section-heading-row">
                  <div>
                    <span className="section-kicker">Audit trail</span>
                    <h2>Source register</h2>
                  </div>
                  <span
                    className={`approval-pill ${
                      output.sourceMode === "CALLER_SUPPLIED"
                        ? "approved"
                        : "candidate"
                    }`}
                  >
                    <Icon
                      name={
                        output.sourceMode === "CALLER_SUPPLIED"
                          ? "shield"
                          : "search"
                      }
                      size={15}
                    />
                    {output.sourceMode === "CALLER_SUPPLIED"
                      ? "Caller-nominated corpus"
                      : "Pending source approval"}
                  </span>
                </div>

                <div className="source-list">
                  {sourceRegister.map((source, index) => (
                    <article
                      className="source-row"
                      key={`${source.url}-${index}`}
                    >
                      <span className="source-number">
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <div>
                        <span className="source-category">
                          {source.category
                            ? CATEGORY_LABELS[source.category]
                            : "Evidence source"}
                        </span>
                        <h3>{source.title}</h3>
                        {source.url && (
                          <small>{safeHostname(source.url)}</small>
                        )}
                      </div>
                      {source.url && (
                        <a
                          aria-label={`Open ${source.title}`}
                          href={source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Icon name="external" size={17} />
                        </a>
                      )}
                    </article>
                  ))}
                </div>

                {(output.missingSourceCategories.length > 0 ||
                  output.sourceResolutionNotes.length > 0) && (
                  <div className="audit-notes">
                    {output.missingSourceCategories.length > 0 && (
                      <p>
                        <strong>Evidence gaps:</strong>{" "}
                        {output.missingSourceCategories
                          .map((category) => CATEGORY_LABELS[category])
                          .join(", ")}
                      </p>
                    )}
                    {output.sourceResolutionNotes.map((note) => (
                      <p key={note}>{note}</p>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      <BrandLogoStrip />

      <footer>
        <BrandMark />
        <span>Slipstream · Powered by Cemented AI</span>
        <p>
          Draft outputs require the appropriate medical, legal, and regulatory
          review.
        </p>
      </footer>
    </main>
  );
}
