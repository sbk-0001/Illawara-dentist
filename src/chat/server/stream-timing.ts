import { CHAT_MODEL } from "./prompt";

/** Abort a gateway stream that has not produced text, then try once more. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Used on the retry, and as an AI Gateway model fallback if the primary request errors. */
export const CHAT_FALLBACK_MODEL = "google/gemini-2.5-flash";

export function chatGenerationSettings(attempt: number) {
  const fallback = attempt > 0;
  return {
    model: fallback ? CHAT_FALLBACK_MODEL : CHAT_MODEL,
    temperature: 0.2,
    maxRetries: 0,
    timeout: { firstChunkMs: FIRST_TOKEN_TIMEOUT_MS },
    providerOptions: fallback ? undefined : { gateway: { models: [CHAT_FALLBACK_MODEL] } },
  };
}

type TextPart = { type: string; text?: string };

function timeoutError(): Error {
  return Object.assign(new Error("first-token timeout"), { name: "TimeoutError" });
}

/**
 * Read a model stream. If no text-delta arrives within the first-token timeout,
 * abort that attempt and run once more (the fallback model). Timing is logged
 * on the server. The log line is language, model, attempt and milliseconds only.
 */
export function createRetryingTextStream<T extends TextPart>(input: {
  language: string;
  run: (attempt: number, signal: AbortSignal) => AsyncIterable<T>;
  log?: (event: Record<string, unknown>) => void;
  timeoutMs?: number;
}): ReadableStream<T> {
  const log = input.log ?? ((event) => console.log(JSON.stringify(event)));
  const timeoutMs = input.timeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
  return new ReadableStream<T>({
    async start(controller) {
      const started = Date.now();
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const settings = chatGenerationSettings(attempt);
        const attemptStarted = Date.now();
        const attemptAbort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = timeoutError();
            attemptAbort.abort(error);
            reject(error);
          }, timeoutMs);
        });
        const iterator = input.run(attempt, attemptAbort.signal)[Symbol.asyncIterator]();
        const buffered: T[] = [];
        let sawText = false;
        const stop = async () => {
          if (timer) clearTimeout(timer);
          await iterator.return?.().catch(() => undefined);
        };
        try {
          for (;;) {
            const pending = iterator.next();
            pending.catch(() => undefined);
            const step = sawText ? await pending : await Promise.race([pending, timeoutPromise]);
            if (step.done) break;
            const part = step.value;
            if (!sawText && part.type === "text-delta" && part.text) {
              sawText = true;
              if (timer) clearTimeout(timer);
              log({
                event: "chat-timing",
                language: input.language,
                model: settings.model,
                attempt,
                outcome: "first-token",
                ttftMs: Date.now() - attemptStarted,
                sinceRequestMs: Date.now() - started,
              });
              for (const earlier of buffered) controller.enqueue(earlier);
              buffered.length = 0;
              controller.enqueue(part);
              continue;
            }
            if (!sawText) {
              buffered.push(part);
              continue;
            }
            controller.enqueue(part);
          }
          await stop();
          if (!sawText) {
            for (const earlier of buffered) controller.enqueue(earlier);
          }
          log({
            event: "chat-timing",
            language: input.language,
            model: settings.model,
            attempt,
            outcome: "done",
            totalMs: Date.now() - started,
          });
          controller.close();
          return;
        } catch (error) {
          await stop();
          lastError = error;
          const elapsedMs = Date.now() - attemptStarted;
          if (sawText || attempt === 1) {
            log({
              event: "chat-timing",
              language: input.language,
              model: settings.model,
              attempt,
              outcome: "error",
              elapsedMs,
              error: error instanceof Error ? error.name : "Error",
            });
            controller.error(error);
            return;
          }
          log({
            event: "chat-timing",
            language: input.language,
            model: settings.model,
            attempt,
            outcome: "retry",
            elapsedMs,
            error: error instanceof Error ? error.name : "Error",
          });
        }
      }
      controller.error(lastError ?? new Error("chat stream failed"));
    },
  });
}
