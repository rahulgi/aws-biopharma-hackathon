import React, { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { citationHref, markGroundedCitations } from "@/lib/grounded-citations";

type Marker = {
  end: number;
  kind: "quote" | "citation";
  numbers: number[];
  start: number;
};

const MARKER_PATTERN = /{{(GQ|GC):([\d,]+)}}([\s\S]*?){{\/\1}}/g;

function renderGroundedChildren(children: ReactNode, requestId: string) {
  const renderNode = (node: ReactNode): ReactNode => {
    if (typeof node !== "string") {
      if (!React.isValidElement<{ children?: ReactNode }>(node)) return node;
      return React.cloneElement(node, undefined, renderNode(node.props.children));
    }

    const markers: Marker[] = [];
    for (const match of node.matchAll(MARKER_PATTERN)) {
      if (match.index === undefined) continue;
      markers.push({
        start: match.index,
        end: match.index + match[0].length,
        kind: match[1] === "GQ" ? "quote" : "citation",
        numbers: (match[2] ?? "").split(",").map(Number),
      });
    }
    if (markers.length === 0) return node;

    const rendered: ReactNode[] = [];
    let cursor = 0;
    for (const marker of markers) {
      if (marker.start > cursor) rendered.push(node.slice(cursor, marker.start));
      const fullMarker = node.slice(marker.start, marker.end);
      const visible = fullMarker.replace(MARKER_PATTERN, "$3");
      rendered.push(
        <a
          className={
            marker.kind === "quote"
              ? "grounded-quote"
              : "grounded-citation-ref"
          }
          href={citationHref(requestId, marker.numbers)}
          key={`${marker.start}-${marker.end}`}
          rel="noreferrer"
          target="_blank"
          title="Open the supporting evidence"
        >
          {visible}
        </a>,
      );
      cursor = marker.end;
    }
    if (cursor < node.length) rendered.push(node.slice(cursor));
    return rendered;
  };

  return React.Children.map(children, renderNode);
}

export function GroundedOutline({
  content,
  requestId,
}: {
  content: string;
  requestId: string;
}) {
  return (
    <div className="markdown-document grounded-outline">
      <div className="grounded-key">
        <span className="grounded-key-swatch">Verified source passage</span>
        <span>
          Green underlines mark verbatim text checked against the retained
          evidence corpus.
        </span>
      </div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
          p: ({ children }) => <p>{renderGroundedChildren(children, requestId)}</p>,
          li: ({ children }) => <li>{renderGroundedChildren(children, requestId)}</li>,
          td: ({ children }) => <td>{renderGroundedChildren(children, requestId)}</td>,
        }}
      >
        {markGroundedCitations(content)}
      </ReactMarkdown>
    </div>
  );
}
