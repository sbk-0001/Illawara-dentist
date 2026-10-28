# Illawarra Dentists chat

Standalone multilingual website chat for the three Illawarra Dentists clinics: [Dapto Dentists](https://daptodentists.com.au/), [Shellharbour Dentists](https://shellharbourdentist.com.au/) and [Woonona Dentists](https://woononadentists.com.au/).

The widget answers in the visitor's language and script, including right-to-left scripts and romanised Banglish or Hinglish. A language picker can force the reply language. Speech input uses Deepgram Nova-3. Replies are text only.

Answers are limited to a committed index of the clinics' public pages. Source chips link to those pages. The widget does not invent prices, dentists, hours, health-fund rules or the concept phone number from the homepage mock-up.

This repository does not contain the new homepage. `/` is a plain preview so the widget can be opened on Vercel. The clinic site is Astro, so it loads the chat from this deployment. See [INTEGRATION.md](INTEGRATION.md).

The ByteVoice website that this behaviour follows is not a public repository, so the widget was built from the product spec rather than from that source tree. Nothing from ByteVoice branding is included.

## Scripts

```bash
npm install
npm run dev          # preview at http://localhost:3000
npm test             # language, picker, retrieval, grounding
npm run index        # recrawl the three public sites
npm run eval         # multilingual eval; skips until AI_GATEWAY_API_KEY is set
npm run test:browser # desktop, 390px and Arabic RTL widget checks
```

## Environment

Copy `.env.example` to `.env.local` (that file stays uncommitted):

- `AI_GATEWAY_API_KEY`
- `DEEPGRAM_API_KEY`
- `CHAT_ALLOWED_ORIGINS`

Chat model: `openai/gpt-5.4-mini` via the Vercel AI Gateway, called without temperature because that model rejects it. It is a fast gateway model aimed at high-volume chat, so time to first token stays low for a public widget while the reply still follows the script instruction. If no text arrives within 8 seconds, that attempt is aborted and retried once on `google/gemini-2.5-flash`. Each request writes one JSON timing line after the response finishes.
