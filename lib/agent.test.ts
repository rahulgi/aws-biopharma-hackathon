import { describe, expect, it } from "vitest";

import {
  artifactByFilename,
  parseApprovedContentOutput,
  upsertSpan,
} from "./agent";

describe("parseApprovedContentOutput", () => {
  it("projects the current agent output contract", () => {
    const output = parseApprovedContentOutput(
      JSON.stringify({
        MEDICAL_INFORMATION_CONTENT_PLAN: {
          kind: "grounded_report",
          requestId: "medical-report",
        },
        MEDICAL_INFORMATION_CONTENT_PLAN_TEXT: "MI",
        MSL_ANALYSIS: {
          kind: "grounded_report",
          requestId: "msl-report",
        },
        MSL_ANALYSIS_TEXT: "MSL",
        MSL_DOCUMENT_FILENAME: "msl.html",
        MSL_POPULATED_SECTION_COUNT: 5,
        SALES_ANALYSIS: {
          kind: "grounded_report",
          requestId: "sales-report",
        },
        SALES_ANALYSIS_TEXT: "Sales",
        SALES_DOCUMENT_FILENAME: "sales.html",
        SALES_POPULATED_SECTION_COUNT: 4,
        SOURCE_MODE: "CALLER_SUPPLIED",
        SOURCE_COUNT: 2,
        SOURCE_TITLES: ["Label", "Guideline"],
        SOURCE_URLS: ["https://example.com/label", "https://example.com/guide"],
        SOURCE_CATEGORIES: ["DRUG_LABEL", "CLINICAL_GUIDELINE"],
        MISSING_SOURCE_CATEGORIES: ["MEDICAL_INFORMATION"],
        VERIFIED_SNIPPET_COUNT: 18,
      }),
    );

    expect(output).toMatchObject({
      medicalInformationReport: { requestId: "medical-report" },
      medicalInformationText: "MI",
      mslReport: { requestId: "msl-report" },
      mslText: "MSL",
      mslDocumentFilename: "msl.html",
      mslPopulatedSectionCount: 5,
      salesReport: { requestId: "sales-report" },
      salesText: "Sales",
      salesDocumentFilename: "sales.html",
      salesPopulatedSectionCount: 4,
      sourceMode: "CALLER_SUPPLIED",
      sourceCount: 2,
      verifiedSnippetCount: 18,
    });
  });

  it("supports the earlier Medical Information analysis field names", () => {
    const output = parseApprovedContentOutput({
      MEDICAL_INFORMATION_ANALYSIS: {
        kind: "grounded_report",
        requestId: "legacy-medical-report",
      },
      MEDICAL_INFORMATION_ANALYSIS_TEXT: "Legacy MI",
    });

    expect(output).toMatchObject({
      medicalInformationReport: { requestId: "legacy-medical-report" },
      medicalInformationText: "Legacy MI",
    });
  });
});

describe("artifactByFilename", () => {
  const artifact = (filename: string) => ({
    filename,
    contentType: "text/html",
    sizeBytes: 1,
    contentBase64: "eA==",
  });

  it("selects each formatted document by the filename returned for its audience", () => {
    const artifacts = [
      artifact("sales.html"),
      artifact("msl.html"),
      artifact("medical.html"),
    ];

    expect(artifactByFilename(artifacts, "medical.html")?.filename).toBe(
      "medical.html",
    );
    expect(artifactByFilename(artifacts, "msl.html")?.filename).toBe(
      "msl.html",
    );
    expect(artifactByFilename(artifacts, "sales.html")?.filename).toBe(
      "sales.html",
    );
  });
});

describe("upsertSpan", () => {
  it("replaces a running span with its settled event", () => {
    const running = {
      id: "nodes/a#1",
      nodeId: "nodes/a",
      label: "a",
      kind: "code" as const,
      startMs: 10,
      durMs: 0,
      status: "running" as const,
    };
    const done = { ...running, durMs: 42, status: "done" as const };

    expect(upsertSpan([running], done)).toEqual([done]);
  });
});
