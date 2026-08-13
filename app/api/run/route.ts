import { NextResponse } from "next/server";

import {
  SOURCE_CATEGORIES,
  type AgentInput,
  type ApprovedSource,
} from "@/lib/agent";
import { previewRunResponse } from "@/lib/preview-run";

export const dynamic = "force-dynamic";
export const maxDuration = 800;
export const runtime = "nodejs";

const DEFAULT_AGENT_ID = "5ca05cc8-69ac-45a5-8b5b-5433aace56c0";

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
}

function parseSources(value: unknown): ApprovedSource[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const sources: ApprovedSource[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.url !== "string" ||
      typeof item.category !== "string" ||
      !SOURCE_CATEGORIES.includes(
        item.category as (typeof SOURCE_CATEGORIES)[number],
      )
    ) {
      return null;
    }
    try {
      const url = new URL(item.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    } catch {
      return null;
    }
    sources.push({
      url: item.url,
      category: item.category as ApprovedSource["category"],
    });
  }
  return sources;
}

function parseInput(value: unknown): AgentInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const drug = cleanText(body.drug, 200);
  const indication = cleanText(body.indication, 500);
  const approvedSources = parseSources(body.approved_sources);
  if (!drug || !indication || approvedSources === null) return null;
  const question =
    body.medical_information_question === undefined ||
    body.medical_information_question === ""
      ? undefined
      : cleanText(body.medical_information_question, 2_000);
  if (body.medical_information_question !== undefined && question === null) {
    return null;
  }
  return {
    drug,
    indication,
    ...(approvedSources.length ? { approved_sources: approvedSources } : {}),
    ...(question ? { medical_information_question: question } : {}),
  };
}

export async function POST(request: Request) {
  const parsed = parseInput(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json(
      { error: "Enter a drug and indication before starting the analysis." },
      { status: 400 },
    );
  }

  const token = process.env.CEMENTED_API_TOKEN;
  if (!token && process.env.DEMO_PREVIEW_MODE === "true") {
    return previewRunResponse(parsed);
  }
  if (!token) {
    return NextResponse.json(
      {
        error:
          "This deployment is missing its Cemented API token. Configure CEMENTED_API_TOKEN in Vercel.",
      },
      { status: 503 },
    );
  }

  const apiUrl = (
    process.env.CEMENTED_API_URL || "https://www.cemented.ai"
  ).replace(/\/$/, "");
  const agentId = process.env.CEMENTED_AGENT_ID || DEFAULT_AGENT_ID;

  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/api/agents/${agentId}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: JSON.stringify(parsed),
        useLiveVersion: true,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json(
      { error: "The Cemented agent could not be reached. Try again shortly." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const payload = await upstream.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : "The Cemented agent could not start this run.";
    return NextResponse.json({ error: message }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
