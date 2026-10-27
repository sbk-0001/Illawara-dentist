# Drop the chat widget into a Next.js homepage

This folder is the whole widget. The demo page at `/` is only a placeholder so the widget can be previewed. Do not treat it as the Illawarra Dentists homepage.

## Copy

1. Copy `src/chat/` into the homepage app (same path, or another folder if you update the imports).
2. Copy the route files:
   - `src/app/api/chat/route.ts`
   - `src/app/api/chat/stt-token/route.ts`
   - `src/app/api/chat/transcribe/route.ts`
3. Those routes re-export handlers from `src/chat/server/`. If you move `src/chat`, point the re-exports at the new path.
4. Keep `outputFileTracingIncludes` in `next.config.ts` so the knowledge index is shipped with the chat route:

```ts
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/chat": ["./src/chat/data/**/*"],
  },
};
```

## Mount

In the root layout (a client boundary is already inside the widget):

```tsx
import { ChatWidget } from "@/chat";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
```

`ChatWidget` floats at the bottom right. It does not render the homepage.

Import the widget from `@/chat` (or `src/chat`). That entry exports only the React component, so the browser bundle does not load the index or the filesystem. API handlers live in `src/chat/handlers.ts` and `src/chat/server/`.

## Environment

Set these on the host. Never commit them.

| Name | Required | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Yes, for answers | Vercel AI Gateway key. Chat and embedding rerank use it. |
| `DEEPGRAM_API_KEY` | Yes, for the microphone | Server key. The browser receives a 60-second grant, not this key. |
| `CHAT_ALLOWED_ORIGINS` | When embedded on another origin | Comma-separated origins, for example `https://daptodentists.com.au,https://shellharbourdentist.com.au,https://woononadentists.com.au`. |

A missing `Origin` header is allowed so server-side eval can call the route. `localhost` is allowed. An `Origin` whose host matches the request `Host` is allowed. Any other origin needs `CHAT_ALLOWED_ORIGINS`.

Rate limits are an in-memory sliding window per server instance (chat 20/min, speech-token 12/min, upload 8/min). On Vercel that is not a global limit. Put a shared limiter in front if you need one account-wide cap.

## Refresh the index

```bash
npm run index
```

That rewrites `src/chat/data/knowledge-index.json` from the three public clinic sites. Commit the JSON. No API key is used.

`npm run build` and `npm run embed` then embed every chunk with `google/text-multilingual-embedding-002` when `AI_GATEWAY_API_KEY` is set, and write `knowledge-embeddings.bin` next to the index. Commit that file when you generate it. Without the key the embed step skips and the server builds the same vectors on the first chat request, then keeps them in memory for that instance.

## Check answers once keys exist

```bash
npm run eval
```

Without `AI_GATEWAY_API_KEY` the script prints `EVAL_STATUS=skipped` and exits 0. With the key it runs 65 questions, checks language, script and grounding, and prints p50/p95 latency and time to first token.

## Model

Chat uses `openai/gpt-5.4-mini` through the AI Gateway (`src/chat/server/prompt.ts`). It is tagged fast on the gateway and is built for high-volume chat, which keeps time to first token down while still following the script instructions. That model is called without a temperature setting, because the gateway rejects temperature for it. If no text arrives within 8 seconds, the route aborts that attempt and retries once on `google/gemini-2.5-flash` (temperature 0.2). After the response finishes, the server prints one JSON line per request: language, model, whether it retried, time to first token and total time. Retrieval is a union of word hits and the nearest precomputed chunk embeddings (`google/text-multilingual-embedding-002`), then a rerank. Lexical search still answers when those vectors and the gateway key are absent. The chat route itself returns 503 until the key is set.

The microphone uses Deepgram Nova-3 with `language=multi`. Keyterm prompting (`keyterm`, not Nova-2 `keywords`) is sent for Dapto, Woonona, Shellharbour, Illawarra, Invisalign, Barrack Heights and Zavy. Deepgram documents that keyterms work on Nova-3 multilingual, so language detection stays on.

When retrieval returns no usable pages, the question shares no clinic or service terms with the top pages, the reply says (in the visitor's language) that the information is missing, or the model marks the reply with `[[NO_ANSWER]]` (the marker is removed before display), the server appends the three clinic phones and Zavy booking links. A reply that already answered from found pages does not get that block. Phone numbers stay in Western digits. Opening hours are stored as days and 24-hour times from the indexed pages and formatted in the reply language; when hours are the question, the model is told to quote that line verbatim.
