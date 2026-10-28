# Embed the chat on the Illawarra Dentists site

The clinic site is an Astro static site (`RidwanKhalid/illawarra-dentists-website`, folder `site/`). This chat app stays on its own deployment. Copying `src/chat` into that repo will not work.

`/` on this app is only a placeholder so the widget can be previewed. It is not the homepage. The page the clinic site should load is `/embed`, through `embed.js`.

Replace `<chat-host>` with the origin of this deployment, with no trailing slash.

## Beside the FAQ

Put a slot where the panel should sit, then load the script in inline mode. The script reads its own `src` and mounts an iframe to `<chat-host>/embed?inline=1` inside that slot. The panel fills the frame.

```astro
<div id="chat-slot"></div>
<script src="https://<chat-host>/embed.js" data-mode="inline" data-target="#chat-slot" defer></script>
```

Give `#chat-slot` a height. The iframe is `width: 100%`, `height: 100%`, and at least 640px tall.

## Floating

Omit the slot. The script adds a bottom-right "Ask the clinics" button and an iframe to `<chat-host>/embed?open=1`. The iframe stays hidden until the button opens it. On a viewport 640px wide or narrower, the open panel fills the screen.

```astro
<script src="https://<chat-host>/embed.js" data-mode="floating" defer></script>
```

`data-mode` defaults to `floating` when it is omitted.

## What the iframe does

The loader sets `allow="microphone"`, a title of "Illawarra Dentists chat", `loading="lazy"`, and `referrerpolicy="origin"`. The chat page calls `/api/chat` on the chat host. The clinic page does not call the API.

The embed page posts `{ source: "illawarra-chat", type: "open" | "close" | "resize" }` to the parent. The loader accepts that message only when `event.origin` is the chat host. It tells the iframe to open with `{ source: "illawarra-chat-host", type: "open" }`, and the embed page accepts that only from the framing page.

`/embed` is a transparent page with the widget alone. `?open=1` opens the panel so it fills the iframe. `?inline=1` keeps the panel open and hides the close button.

## Who may frame `/embed`

The response sets `Content-Security-Policy: frame-ancestors`. Only `/embed` can be framed. The homepage and `/api/chat` send `frame-ancestors 'none'`.

Allowed ancestors are:

- this chat host (`'self'`)
- `https://daptodentists.com.au`, `https://shellharbourdentist.com.au`, and `https://woononadentists.com.au`
- `http://localhost:*`, `https://localhost:*`, `http://127.0.0.1:*`, and `https://127.0.0.1:*`
- `https://illawarra-dentists-website-git-faq-chat-embed-strategybyte.vercel.app`
- each extra origin in `CHAT_ALLOWED_ORIGINS`
- `https://*.vercel.app` for other previews of this project

A preview hostname is one label, such as `illawarra-dentists-website-git-branch-team.vercel.app`. CSP can only wildcard a whole label, so those hosts are allowed as `https://*.vercel.app`. A referrer whose host is `illawarra-dentists-website` optionally followed by a deployment suffix is also written into the policy. A different Vercel project is not added from the referrer.

List the live clinic origins explicitly:

```bash
CHAT_ALLOWED_ORIGINS=https://daptodentists.com.au,https://shellharbourdentist.com.au,https://woononadentists.com.au
```

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
