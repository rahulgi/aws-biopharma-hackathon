const QUOTE_CITATION =
  /["\u201c]([^"\u201d]+?)["\u201d][^\S\n]*((?:\[\d+\][^\S\n]*)+)/g;
const CITATION_MARKER = /\[(\d+)\]/g;

export const citationNumbers = (markers: string): number[] =>
  [...markers.matchAll(CITATION_MARKER)].map((match) => Number(match[1]));

export const citationHref = (requestId: string, numbers: number[]): string => {
  const url = new URL(
    `/v3/research/${encodeURIComponent(requestId)}`,
    "https://www.cemented.ai",
  );
  if (numbers.length > 0) url.hash = `citation-${numbers.join("-")}`;
  return url.toString();
};

/**
 * Convert the exact quoted-claim syntax produced by Grounded Research into
 * lightweight markers that ReactMarkdown can render with the native green
 * evidence underline. Bare numeric citations become linked superscripts.
 */
export function markGroundedCitations(content: string): string {
  let next = content.replace(
    new RegExp(QUOTE_CITATION.source, QUOTE_CITATION.flags),
    (_match, quote: string, markers: string) => {
      const numbers = citationNumbers(markers);
      const labels = numbers.map((number) => `[${number}]`).join("");
      const trailingWhitespace = markers.match(/[^\S\n]*$/)?.[0] ?? "";
      return `{{GQ:${numbers.join(",")}}}“${quote}”{{/GQ}} ${labels}${trailingWhitespace}`;
    },
  );

  next = next.replace(CITATION_MARKER, (_match, number: string) => {
    return `{{GC:${number}}}[${number}]{{/GC}}`;
  });
  return next;
}
