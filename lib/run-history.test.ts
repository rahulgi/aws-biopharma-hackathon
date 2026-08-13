import { describe, expect, it } from "vitest";

import type { AgentRunResult } from "./agent";
import {
  readRunHistory,
  RUN_HISTORY_LIMIT,
  RUN_HISTORY_STORAGE_KEY,
  saveRunToHistory,
  type SavedAgentRun,
} from "./run-history";

function savedRun(id: string): SavedAgentRun {
  return {
    id,
    savedAt: "2026-08-13T12:00:00.000Z",
    runId: id,
    input: { drug: `Drug ${id}`, indication: "Indication" },
    result: {
      status: "success",
      output: "{}",
      durationMs: 1_000,
      costUsd: 0,
    } satisfies AgentRunResult,
    isPreview: false,
  };
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("run history", () => {
  it("stores newest runs first, deduplicates, and enforces the limit", () => {
    const storage = memoryStorage();
    const current = Array.from({ length: RUN_HISTORY_LIMIT }, (_, index) =>
      savedRun(`run-${index}`),
    );

    const saved = saveRunToHistory(storage, savedRun("run-3"), current);

    expect(saved.saved).toBe(true);
    expect(saved.history).toHaveLength(RUN_HISTORY_LIMIT);
    expect(saved.history[0].id).toBe("run-3");
    expect(saved.history.filter((run) => run.id === "run-3")).toHaveLength(1);
    expect(readRunHistory(storage)).toEqual(saved.history);
  });

  it("ignores malformed local data", () => {
    expect(readRunHistory(memoryStorage("not-json"))).toEqual([]);
    expect(readRunHistory(memoryStorage(JSON.stringify([{ id: 4 }])))).toEqual(
      [],
    );
  });

  it("drops older entries when storage quota is reached", () => {
    let written = "";
    const storage = {
      getItem: () => written || null,
      setItem: (key: string, next: string) => {
        expect(key).toBe(RUN_HISTORY_STORAGE_KEY);
        const entries = JSON.parse(next) as unknown[];
        if (entries.length > 2) throw new DOMException("Quota", "QuotaExceededError");
        written = next;
      },
    };

    const saved = saveRunToHistory(
      storage,
      savedRun("new"),
      [savedRun("old-1"), savedRun("old-2"), savedRun("old-3")],
    );

    expect(saved.saved).toBe(true);
    expect(saved.history.map((run) => run.id)).toEqual(["new", "old-1"]);
  });
});
