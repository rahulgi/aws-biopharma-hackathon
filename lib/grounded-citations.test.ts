import { describe, expect, it } from "vitest";

import {
  citationHref,
  citationNumbers,
  markGroundedCitations,
} from "./grounded-citations";

describe("grounded citation presentation", () => {
  it("marks verified quoted passages and their citation references", () => {
    expect(
      markGroundedCitations('The label says "approved use" [3][4].'),
    ).toBe(
      "The label says {{GQ:3,4}}“approved use”{{/GQ}} {{GC:3}}[3]{{/GC}}{{GC:4}}[4]{{/GC}}.",
    );
  });

  it("leaves an unsupported quotation visibly unverified", () => {
    expect(markGroundedCitations('The draft says "not sourced".')).toBe(
      'The draft says "not sourced".',
    );
  });

  it("builds a native evidence-view link without leaking other state", () => {
    expect(citationNumbers("[2][19]")).toEqual([2, 19]);
    expect(citationHref("report id", [2, 19])).toBe(
      "https://www.cemented.ai/v3/research/report%20id#citation-2-19",
    );
  });
});
