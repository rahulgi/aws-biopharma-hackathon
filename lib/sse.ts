export type SseEvent = {
  event: string;
  data: unknown;
};

export type SseParser = {
  feed(chunk: string): void;
  flush(): void;
};

function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  const raw = data.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = "";

  const drain = () => {
    for (;;) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) return;
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
    }
  };

  return {
    feed(chunk) {
      buffer += chunk;
      drain();
    },
    flush() {
      drain();
      if (!buffer.trim()) return;
      const parsed = parseFrame(buffer);
      buffer = "";
      if (parsed) onEvent(parsed);
    },
  };
}

export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const parser = createSseParser(onEvent);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (value) parser.feed(decoder.decode(value, { stream: !done }));
    if (done) break;
  }
  parser.flush();
}
