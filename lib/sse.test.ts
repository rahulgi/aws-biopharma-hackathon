import { describe, expect, it } from "vitest";

import { createSseParser } from "./sse";

describe("createSseParser", () => {
  it("parses named JSON events split across chunks", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const parser = createSseParser((event) => events.push(event));

    parser.feed('event: start\ndata: {"runId":');
    parser.feed('"run-1"}\n\nevent: span\r\ndata: {"id":"node#1"}\r\n');
    parser.feed("\r\n");
    parser.flush();

    expect(events).toEqual([
      { event: "start", data: { runId: "run-1" } },
      { event: "span", data: { id: "node#1" } },
    ]);
  });

  it("ignores keepalive comments and retains plain text data", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const parser = createSseParser((event) => events.push(event));

    parser.feed(": keepalive\n\nevent: error\ndata: upstream unavailable\n\n");

    expect(events).toEqual([{ event: "error", data: "upstream unavailable" }]);
  });
});
