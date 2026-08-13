import type { AgentInput, AgentRunResult } from "./agent";

export const RUN_HISTORY_STORAGE_KEY = "slipstream.run-history.v1";
export const RUN_HISTORY_LIMIT = 8;

export type SavedAgentRun = {
  id: string;
  savedAt: string;
  runId: string;
  input: AgentInput;
  result: AgentRunResult;
  isPreview: boolean;
};

type RunHistoryStorage = Pick<Storage, "getItem" | "setItem">;

function isSavedAgentRun(value: unknown): value is SavedAgentRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const input = candidate.input as Record<string, unknown> | undefined;
  const result = candidate.result as Record<string, unknown> | undefined;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.isPreview === "boolean" &&
    !!input &&
    typeof input.drug === "string" &&
    typeof input.indication === "string" &&
    !!result &&
    result.status === "success" &&
    typeof result.durationMs === "number"
  );
}

export function readRunHistory(storage: RunHistoryStorage): SavedAgentRun[] {
  try {
    const serialized = storage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (!serialized) return [];
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed)
      ? parsed.filter(isSavedAgentRun).slice(0, RUN_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function saveRunToHistory(
  storage: RunHistoryStorage,
  entry: SavedAgentRun,
  current: SavedAgentRun[],
): { history: SavedAgentRun[]; saved: boolean } {
  const merged = [
    entry,
    ...current.filter((candidate) => candidate.id !== entry.id),
  ].slice(0, RUN_HISTORY_LIMIT);

  // HTML artifacts are stored with each result. If the browser quota is
  // reached, retain the newest run and progressively discard older entries.
  for (let count = merged.length; count > 0; count -= 1) {
    const history = merged.slice(0, count);
    try {
      storage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
      return { history, saved: true };
    } catch {
      // Try again with one fewer older run.
    }
  }

  return { history: current, saved: false };
}
