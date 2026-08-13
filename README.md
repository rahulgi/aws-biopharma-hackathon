# Slipstream — pharma evidence repackaging

A standalone Next.js hackathon demo for the Cemented v3 approved-content agent. A visitor selects a drug and indication, watches the agent's actual node-boundary trace, then reviews cited drafts for Medical Affairs, MSLs, and Sales alongside their shared source register.

Each audience opens on a grounded outline. Verbatim passages verified against the retained corpus carry Cemented's green underline treatment and link to the native full-evidence audit view; a clean-draft toggle removes the evidence annotation for downstream review.

Successful runs are saved in that browser's local storage, including their inputs, traces, outputs, and formatted HTML artifacts. The history list can restore a result without invoking the agent, while its explicit **Run latest** action submits the same saved input to the latest published version.

The app is intentionally separate from the main Cemented application and can be deployed to Vercel from this directory.

## What it consumes

The configured v3 agent is `5ca05cc8-69ac-45a5-8b5b-5433aace56c0`. The current contract is:

```ts
type Input = {
  drug: string;
  indication: string;
  approved_sources?: Array<{
    url: string;
    category:
      | "DRUG_LABEL"
      | "PHASE_3_RESULTS"
      | "MEDICAL_INFORMATION"
      | "CLINICAL_GUIDELINE";
  }>;
  medical_information_question?: string;
};
```

The output parser reads the agent's three `*_TEXT` fields, audience-specific artifact filenames, source audit fields, and verified snippet count. It ignores additional fields so the agent can keep evolving without breaking the demo.

## Published agent

The live agent includes the API trigger required for Bearer-token runs:

```ts
export default defineApiTrigger();
```

The demo calls the published version so Studio draft changes do not affect a hackathon run until they are published.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set these values in `.env.local`:

```dotenv
CEMENTED_API_URL=https://www.cemented.ai
CEMENTED_AGENT_ID=5ca05cc8-69ac-45a5-8b5b-5433aace56c0
CEMENTED_API_TOKEN=your-personal-cemented-api-token
```

Create the token at `https://www.cemented.ai/settings/tokens`. Do not commit it or expose it through a `NEXT_PUBLIC_*` variable. The browser calls the local `/api/run` route, which adds the token server-side and relays Cemented's SSE response.

For UI work without invoking the live agent, leave the token unset and use:

```dotenv
DEMO_PREVIEW_MODE=true
```

Preview mode is clearly labeled in the interface and returns local sample content. Keep it disabled in the hackathon deployment.

## Vercel deployment

1. Import the repository into Vercel.
2. Add `CEMENTED_API_URL`, `CEMENTED_AGENT_ID`, and `CEMENTED_API_TOKEN` as server-side environment variables.
3. Deploy with the standard Next.js preset.

The streaming function declares `maxDuration = 800`. Use a Vercel plan/configuration that permits runs of that length. The inspected example took about nine minutes; the live request must remain within the deployment's function-duration limit.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Design notes

- The curated Emtriva example carries the same six nominated sources used by the inspected Studio run. Choosing it demonstrates a closed caller-supplied corpus.
- Other autocomplete choices omit approved URLs. The agent discovers candidates and the UI labels them as pending source approval.
- A span is upserted by `span.id`, so its settled `done` or `error` event replaces its earlier `running` event.
- The workflow groups the agent's detailed nodes for presentation while retaining real labels and timing in the activity ticker.
- Returned HTML artifacts stay in the browser as base64 until the visitor opens or downloads them, and are retained with browser-local run history when quota permits.
- Run history is device- and browser-specific. It keeps up to eight recent results and drops older entries first if browser storage is full.
