import type { AgentInput, SourceCategory, TraceSpan } from "./agent";

const encoder = new TextEncoder();

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function previewOutput(input: AgentInput) {
  const sourceMode = input.approved_sources?.length
    ? "CALLER_SUPPLIED"
    : "DISCOVERED_CANDIDATES";
  const sourceCategories: SourceCategory[] = input.approved_sources?.length
    ? input.approved_sources.map((source) => source.category)
    : ["DRUG_LABEL", "PHASE_3_RESULTS", "CLINICAL_GUIDELINE"];
  const sourceUrls = input.approved_sources?.map((source) => source.url) ?? [
    "https://example.com/label",
    "https://example.com/phase-3",
    "https://example.com/guideline",
  ];
  const sourceTitles = sourceUrls.map((url, index) => {
    if (url.includes("dailymed"))
      return `${input.drug} prescribing information`;
    if (url.includes("clinicalinfo")) return "Clinical-practice guideline";
    if (url.includes("ncbi")) return "Peer-reviewed clinical evidence";
    return `Evidence source ${index + 1}`;
  });

  return {
    MEDICAL_INFORMATION_CONTENT_PLAN: {
      kind: "grounded_report",
      requestId: "preview-medical-information",
    },
    MEDICAL_INFORMATION_CONTENT_PLAN_TEXT: `# Medical Information content plan

> Preview data for interface review. No medical conclusion should be drawn from this content.

## MI-01 — Response scope

Address the submitted question for **${input.drug}** in **${input.indication}** using only the shared source register.

## MI-02 — Executive summary

Present the approved indication: "EMTRIVA is indicated in combination with other antiretroviral agents for the treatment of HIV-1 infection" [1]. Keep the consequential efficacy and safety evidence, and the important limitations, attached to their sources.

## MI-03 — Product labeling

Keep labeled information separate from clinical guidelines and peer-reviewed publications. Surface any unsupported requested section as an evidence gap.

## MI-09 — Unsupported content

Do not add claims, operational details, or conclusions that are absent from the verified corpus.`,
    MEDICAL_INFORMATION_DOCUMENT_FILENAME: `${input.drug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-medical-information.html`,
    MEDICAL_INFORMATION_POPULATED_SECTION_COUNT: 8,
    MSL_ANALYSIS: {
      kind: "grounded_report",
      requestId: "preview-msl",
    },
    MSL_ANALYSIS_TEXT: `# MSL scientific-exchange plan

> Preview data for interface review.

## Intended use

Support a balanced scientific exchange concerning **${input.drug}** in **${input.indication}**.

## Suggested narrative

1. Establish disease context from the guideline source.
2. Describe the labeled population and regimen without extending the label: "in combination with other antiretroviral agents" [1].
3. Review study design before presenting results.
4. Close with limitations and open scientific questions.

## Discussion prompts

- Which evidence gaps are most relevant to this HCP's patient population?
- Which results require additional context before they can inform an exchange?`,
    MSL_DOCUMENT_FILENAME: `${input.drug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-msl-scientific-exchange.html`,
    MSL_POPULATED_SECTION_COUNT: 6,
    SALES_ANALYSIS: {
      kind: "grounded_report",
      requestId: "preview-sales",
    },
    SALES_ANALYSIS_TEXT: `# Sales content governance plan

> Preview data for interface review. External use requires medical, legal, and regulatory review.

## Label-supported foundation

Build the content hierarchy from the approved indication: "for the treatment of HIV-1 infection" [1], and other supported label language for **${input.drug}**.

## Fair balance

Give consequential safety information comparable prominence. Preserve the population, comparator, endpoint, and time point for any clinical result.

## Content to withhold

Exclude unsupported comparative, superiority, access, adherence, and quality-of-life claims until an approved source supports them.`,
    SALES_DOCUMENT_FILENAME: `${input.drug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-sales-evidence-aid.html`,
    SALES_POPULATED_SECTION_COUNT: 5,
    SOURCE_MODE: sourceMode,
    SOURCE_COUNT: sourceUrls.length,
    SOURCE_TITLES: sourceTitles,
    SOURCE_URLS: sourceUrls,
    SOURCE_CATEGORIES: sourceCategories,
    MISSING_SOURCE_CATEGORIES: [
      "DRUG_LABEL",
      "PHASE_3_RESULTS",
      "MEDICAL_INFORMATION",
      "CLINICAL_GUIDELINE",
    ].filter(
      (category) => !sourceCategories.includes(category as SourceCategory),
    ),
    SOURCE_RESOLUTION_NOTES: [
      sourceMode === "CALLER_SUPPLIED"
        ? "The supplied URL set remained closed during source resolution."
        : "The sources are discovery candidates and require approval before production use.",
    ],
    VERIFIED_SNIPPET_COUNT: 42,
  };
}

function previewDocument(input: AgentInput, audience: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${input.drug} ${audience} preview</title><style>body{font:16px/1.6 system-ui;max-width:760px;margin:48px auto;color:#17302f}h1,h2{color:#0d615b}.notice{padding:16px;background:#fff4d6;border:1px solid #edd99b;border-radius:10px}</style></head><body><p class="notice"><strong>Preview data.</strong> This file demonstrates the document handoff and is not a medical response.</p><h1>${input.drug}</h1><p>${audience} framework for ${input.indication}.</p><h2>Response scope</h2><p>Populate this fixed template only from the cited Grounded content plan.</p><h2>Source governance</h2><p>Keep labeling, guidelines, and clinical studies distinct through review.</p></body></html>`;
}

type SpanSeed = Pick<TraceSpan, "nodeId" | "label" | "kind">;

export function previewRunResponse(input: AgentInput): Response {
  const trace: TraceSpan[] = [];
  let sequence = 0;
  let cursor = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) =>
        controller.enqueue(frame(event, data));
      const runSpan = async (seed: SpanSeed, duration = 520) => {
        const id = `${seed.nodeId}#${sequence++}`;
        const running: TraceSpan = {
          ...seed,
          id,
          startMs: cursor,
          durMs: 0,
          status: "running",
        };
        emit("span", running);
        await wait(duration);
        const done: TraceSpan = {
          ...running,
          durMs: duration,
          status: "done",
        };
        trace.push(done);
        cursor += duration;
        emit("span", done);
      };

      try {
        emit("start", {
          runId: `preview-${Date.now()}`,
          versionId: "preview-version",
          versionLabel: "preview",
          preview: true,
        });

        await runSpan({
          nodeId: "nodes/discoverSources",
          label: "Resolve source corpus",
          kind: "code",
        });
        await runSpan({
          nodeId: "nodes/hydrateSources",
          label: "Hydrate approved sources",
          kind: "code",
        });
        await runSpan(
          {
            nodeId: "nodes/extractSharedSnippets",
            label: "Extract shared evidence",
            kind: "code",
          },
          760,
        );

        const branches: Array<SpanSeed> = [
          {
            nodeId: "nodes/buildMedicalInformation",
            label: "Build Medical Information",
            kind: "code",
          },
          {
            nodeId: "nodes/analyzeMsl",
            label: "Analyze for MSLs",
            kind: "code",
          },
          {
            nodeId: "nodes/analyzeSales",
            label: "Analyze for Sales",
            kind: "code",
          },
        ];
        const branchStarts = branches.map((seed) => {
          const span: TraceSpan = {
            ...seed,
            id: `${seed.nodeId}#${sequence++}`,
            startMs: cursor,
            durMs: 0,
            status: "running",
          };
          emit("span", span);
          return span;
        });
        await wait(900);
        for (const [index, running] of branchStarts.entries()) {
          const done: TraceSpan = {
            ...running,
            durMs: 900 + index * 120,
            status: "done",
          };
          trace.push(done);
          emit("span", done);
          await wait(180);
        }
        cursor += 1_140;

        await runSpan({
          nodeId: "nodes/populateMedicalInformationTemplate",
          label: "Populate fixed template",
          kind: "code",
        });
        await runSpan({
          nodeId: "nodes/saveMedicalInformationDocument",
          label: "Save review document",
          kind: "action",
        });

        const output = previewOutput(input);
        const documents = [
          {
            filename: output.MEDICAL_INFORMATION_DOCUMENT_FILENAME,
            content: previewDocument(input, "Medical Information"),
          },
          {
            filename: output.MSL_DOCUMENT_FILENAME,
            content: previewDocument(input, "MSL scientific exchange"),
          },
          {
            filename: output.SALES_DOCUMENT_FILENAME,
            content: previewDocument(input, "Sales evidence aid"),
          },
        ];
        emit("result", {
          status: "success",
          output: JSON.stringify(output),
          durationMs: cursor,
          costUsd: 0,
          trace,
          artifacts: documents.map((document) => ({
            filename: document.filename,
            contentType: "text/html",
            sizeBytes: Buffer.byteLength(document.content),
            contentBase64: Buffer.from(document.content).toString("base64"),
          })),
          agentVersionId: "preview-version",
          versionLabel: "preview",
        });
        emit("done", {});
        controller.close();
      } catch (error) {
        emit("error", {
          message:
            error instanceof Error ? error.message : "Preview run failed.",
        });
        emit("done", {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Demo-Preview": "true",
    },
  });
}
