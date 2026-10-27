import { CHAT_MODEL } from "./prompt";
import { drainStatusTag, type StatusTag } from "./status-tag";

/** Abort a gateway stream that has not produced text, then try once more. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Used on the retry, and as an AI Gateway model fallback if the primary request errors. */
export const CHAT_FALLBACK_MODEL = "google/gemini-2.5-flash";

/** gpt-5 and o-series models reject a temperature parameter on the AI Gateway. */
export function modelSupportsTemperature(model: string): boolean {
  return !/(?:^|\/)(?:gpt-5|o1|o3|o4)(?:[.-]|$)/i.test(model);
}

const MIN_FIRST_TOKEN_BUDGET_MS = 250;

/**
 * Attempt 0 spends the 8s budget from request start, so retrieval time counts.
 * A retry gets a fresh full budget. Callers that pass only `timeoutMs` (tests)
 * keep that value as the attempt budget.
 */
export function firstTokenBudget(input: { attempt: number; timeoutMs?: number; startedAt?: number; now?: number }): number {
  const timeoutMs = input.timeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
  if (input.attempt > 0 || input.startedAt === undefined) return timeoutMs;
  const elapsed = Math.max(0, (input.now ?? Date.now()) - input.startedAt);
  return Math.max(MIN_FIRST_TOKEN_BUDGET_MS, timeoutMs - elapsed);
}

export function chatGenerationSettings(attempt: number, firstChunkMs = FIRST_TOKEN_TIMEOUT_MS) {
  const model = attempt > 0 ? CHAT_FALLBACK_MODEL : CHAT_MODEL;
  return {
    model,
    ...(modelSupportsTemperature(model) ? { temperature: 0.2 } : {}),
    maxRetries: 0,
    timeout: { firstChunkMs },
    providerOptions: attempt > 0 ? undefined : { gateway: { models: [CHAT_FALLBACK_MODEL] } },
  };
}

type TextPart = { type: string; text?: string };

export type ChatTimingEvent = {
  event: "chat-timing";
  language: string;
  model: string;
  attempt: number;
  retried: boolean;
  outcome: "done" | "error" | "cancelled";
  ttftMs: number | null;
  totalMs: number;
  /** Time spent in hybrid retrieval before the model stream, in milliseconds. */
  retrievalMs: number;
  firstAttemptMs?: number;
  error?: string;
  /** True when the reply did not open with [[A]], [[N]] or [[G]]. */
  tag_missing: boolean;
  /** Share of replies in this process that opened without a status tag. */
  tag_missing_rate: number;
};

const tagStats = { seen: 0, missing: 0 };

/** Test helper. The rate is otherwise the lifetime of this server process. */
export function resetTagMissingStats(): void {
  tagStats.seen = 0;
  tagStats.missing = 0;
}

function noteTagMissing(missing: boolean): number {
  tagStats.seen += 1;
  if (missing) tagStats.missing += 1;
  return Math.round((tagStats.missing / tagStats.seen) * 1000) / 1000;
}

function timeoutError(): Error {
  return Object.assign(new Error("first-token timeout"), { name: "TimeoutError" });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/**
 * Read a model stream. If no text-delta arrives within the first-token timeout,
 * abort that attempt and run once more (the fallback model).
 * Pass `startedAt` from request start so retrieval counts toward the 8s budget.
 * One structured line is logged when the stream settles. The chat route prints
 * that line from Next.js after() so it shows up in Vercel runtime logs.
 */
export function createRetryingTextStream<T extends TextPart>(input: {
  language: string;
  run: (attempt: number, signal: AbortSignal) => AsyncIterable<T>;
  log?: (event: ChatTimingEvent) => void;
  timeoutMs?: number;
  /** Request start. When set, attempt 0's budget is what remains of `timeoutMs`. */
  startedAt?: number;
  /** Logged as-is. Measured by the caller around retrieval. */
  retrievalMs?: number;
  onStatus?: (status: { tag: StatusTag | null; missing: boolean }) => void;
}): ReadableStream<T> {
  const log = input.log ?? ((event: ChatTimingEvent) => console.log(JSON.stringify(event)));
  const timeoutMs = input.timeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
  const origin = input.startedAt ?? Date.now();
  const retrievalMs = input.retrievalMs ?? 0;
  let settled = false;
  let attempt = 0;
  let model = chatGenerationSettings(0).model;
  let ttftMs: number | null = null;
  let firstAttemptMs: number | undefined;
  let tagHold = "";
  let tagDecided = false;
  let tagMissing = true;
  let dropBreak = false;

  const noteTag = (tag: StatusTag | null, missing: boolean) => {
    tagDecided = true;
    tagMissing = missing;
    input.onStatus?.({ tag, missing });
  };

  const takeText = (text: string, final: boolean): string => {
    if (tagDecided) {
      if (!dropBreak) return text;
      dropBreak = false;
      return text.replace(/^[ \t]*\r?\n?/, "");
    }
    const drained = drainStatusTag(tagHold + text, final);
    if (!drained.decided) {
      tagHold = drained.hold;
      return "";
    }
    tagHold = "";
    dropBreak = drained.bare;
    noteTag(drained.tag, drained.missing);
    return drained.visible;
  };

  const finish = (outcome: ChatTimingEvent["outcome"], error?: string) => {
    if (settled) return;
    settled = true;
    const line: ChatTimingEvent = {
      event: "chat-timing",
      language: input.language,
      model,
      attempt,
      retried: firstAttemptMs !== undefined,
      outcome,
      ttftMs,
      totalMs: Date.now() - origin,
      retrievalMs,
      tag_missing: tagMissing,
      tag_missing_rate: noteTagMissing(tagMissing),
    };
    if (firstAttemptMs !== undefined) line.firstAttemptMs = firstAttemptMs;
    if (error) line.error = error;
    log(line);
  };

  return new ReadableStream<T>({
    async start(controller) {
      let lastError: unknown;
      try {
        for (attempt = 0; attempt < 2; attempt += 1) {
          const budget = firstTokenBudget({ attempt, timeoutMs, startedAt: input.startedAt });
          const settings = chatGenerationSettings(attempt, budget);
          model = settings.model;
          const attemptStarted = Date.now();
          const attemptAbort = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              const error = timeoutError();
              attemptAbort.abort(error);
              reject(error);
            }, budget);
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
                ttftMs = Date.now() - origin;
                for (const earlier of buffered) controller.enqueue(earlier);
                buffered.length = 0;
                const visible = takeText(part.text, false);
                if (visible) controller.enqueue({ ...part, text: visible });
                continue;
              }
              if (!sawText) {
                buffered.push(part);
                continue;
              }
              if (part.type === "text-delta" && part.text) {
                const visible = takeText(part.text, false);
                if (visible) controller.enqueue({ ...part, text: visible });
                continue;
              }
              controller.enqueue(part);
            }
            await stop();
            if (!sawText) {
              for (const earlier of buffered) controller.enqueue(earlier);
            }
            const tail = takeText("", true);
            if (tail) controller.enqueue({ type: "text-delta", text: tail } as T);
            finish("done");
            controller.close();
            return;
          } catch (error) {
            await stop();
            lastError = error;
            if (sawText || attempt === 1) {
              finish("error", errorName(error));
              controller.error(error);
              return;
            }
            firstAttemptMs = Date.now() - attemptStarted;
          }
        }
        finish("error", errorName(lastError));
        controller.error(lastError ?? new Error("chat stream failed"));
      } catch (error) {
        finish("error", errorName(error));
        try {
          controller.error(error);
        } catch {
          // The controller may already be closed.
        }
      }
    },
    cancel() {
      finish("cancelled");
    },
  });
}
