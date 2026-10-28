import { replyScriptGate, replyScriptRatio } from "../language/reply-script";
import { CHAT_MODEL } from "./prompt";
import { drainStatusTag, type StatusTag } from "./status-tag";
import { createSystemTextFilter, stripFeeCaveat, tryAgainMessage } from "./system-text";

/** Abort a gateway stream that has not produced visible text, then try once more. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Hard stop from request start, including retrieval and a retry. */
export const OVERALL_DEADLINE_MS = 20_000;

export type StalledStage = "retrieval" | "first-token" | "retry" | "script" | "body";

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

type TextPart = { type: string; text?: string; id?: string };

export type ChatTimingEvent = {
  event: "chat-timing";
  language: string;
  model: string;
  attempt: number;
  retried: boolean;
  outcome: "done" | "error" | "cancelled" | "deadline";
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
  /** Deepgram's language for a voice turn, after the allowlist. Null for typed text. */
  spokenLanguage: string | null;
  inputMode: "voice" | "text";
  /** Script of the visitor's text before any spoken-language override. */
  transcriptScript: string;
  /** True when a voice language replaced an English, Latin, or unknown text detection. */
  langOverride: boolean;
  /** Why the live Deepgram socket closed, when the browser reported it. */
  liveDrop?: string;
  /** Stage that timed out or produced the wrong script. Null when nothing stalled. */
  stalled: StalledStage | null;
  /**
   * Share of counted letters in the target script for the reply that was shown.
   * Null when that reply was not judged. Logged even when nothing stalled.
   */
  scriptRatio: number | null;
  /** The 2s retrieval cap returned lexical hits. */
  retrievalTimedOut?: boolean;
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

function deadlineError(): Error {
  return Object.assign(new Error("overall deadline"), { name: "DeadlineError" });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

/**
 * Read a model stream. If no visible text arrives within the first-token timeout,
 * abort that attempt and run once more (the fallback model). A status tag alone
 * does not count as visible text. If the visible reply uses the wrong script,
 * regenerate once with a stronger instruction. An overall deadline from request
 * start ends the stream with a localized try-again line.
 * Pass `startedAt` from request start so retrieval counts toward the 8s budget.
 * One structured line is logged when the stream settles. The chat route prints
 * that line from Next.js after() so it shows up in Vercel runtime logs.
 */
export function createRetryingTextStream<T extends TextPart>(input: {
  language: string;
  run: (attempt: number, signal: AbortSignal, mode?: { scriptRetry?: boolean }) => AsyncIterable<T>;
  log?: (event: ChatTimingEvent) => void;
  timeoutMs?: number;
  /** From request start. Defaults to 20s. */
  deadlineMs?: number;
  /** Shown when the deadline wins before a usable reply. */
  fallbackText?: string;
  retrievalTimedOut?: boolean;
  /** Request start. When set, attempt 0's budget is what remains of `timeoutMs`. */
  startedAt?: number;
  /** Logged as-is. Measured by the caller around retrieval. */
  retrievalMs?: number;
  spokenLanguage?: string | null;
  inputMode?: "voice" | "text";
  transcriptScript?: string;
  langOverride?: boolean;
  liveDrop?: string;
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
  let stalled: StalledStage | undefined;
  let released = false;
  let scriptRatio: number | null = null;
  let heldScript: { text: string; ratio: number | null } | null = null;

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
      spokenLanguage: input.spokenLanguage ?? null,
      inputMode: input.inputMode === "voice" ? "voice" : "text",
      transcriptScript: input.transcriptScript ?? "",
      langOverride: input.langOverride === true,
      ...(input.liveDrop ? { liveDrop: input.liveDrop } : {}),
      stalled: stalled ?? null,
      scriptRatio,
      ...(input.retrievalTimedOut ? { retrievalTimedOut: true } : {}),
    };
    if (firstAttemptMs !== undefined) line.firstAttemptMs = firstAttemptMs;
    if (error) line.error = error;
    log(line);
  };

  const deadlineMs = input.deadlineMs ?? OVERALL_DEADLINE_MS;
  const fallbackText = input.fallbackText || tryAgainMessage(input.language, []);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let activeAbort: AbortController | undefined;
  let onDeadline: () => void = () => undefined;
  const pastDeadline = () => Date.now() - origin >= deadlineMs;
  const deadlinePromise = new Promise<never>((_, reject) => {
    const remaining = Math.max(0, deadlineMs - (Date.now() - origin));
    deadlineTimer = setTimeout(() => {
      const error = deadlineError();
      activeAbort?.abort(error);
      onDeadline();
      reject(error);
    }, remaining);
  });
  deadlinePromise.catch(() => undefined);

  function resetTag() {
    tagHold = "";
    tagDecided = false;
    dropBreak = false;
  }

  return new ReadableStream<T>({
    async start(controller) {
      let lastError: unknown;
      const clearDeadline = () => {
        if (deadlineTimer) clearTimeout(deadlineTimer);
      };
      let activeTextId: string | undefined;
      let textOpen = false;
      let idSeq = 0;
      const nextId = () => `reply-${++idSeq}`;
      const markOpen = (id: string) => {
        activeTextId = id;
        textOpen = true;
      };
      const closeText = () => {
        if (!textOpen || !activeTextId) return;
        controller.enqueue({ type: "text-end", id: activeTextId } as T);
        textOpen = false;
      };
      const publishSaved = (text: string) => {
        const filter = createSystemTextFilter(input.language);
        const visible = `${filter.push(text)}${filter.flush()}`;
        if (!visible) return;
        const id = nextId();
        controller.enqueue({ type: "text-start", id } as T);
        controller.enqueue({ type: "text-delta", id, text: visible } as T);
        controller.enqueue({ type: "text-end", id } as T);
        if (ttftMs === null) ttftMs = Date.now() - origin;
        released = true;
      };
      let fallbackSent = false;
      const emitFallback = (stage: StalledStage) => {
        if (fallbackSent || settled) return;
        fallbackSent = true;
        stalled = stage;
        clearDeadline();
        const text = released ? `\n${fallbackText}` : fallbackText;
        if (!textOpen || !activeTextId) {
          const id = nextId();
          controller.enqueue({ type: "text-start", id } as T);
          controller.enqueue({ type: "text-delta", id, text } as T);
          controller.enqueue({ type: "text-end", id } as T);
        } else {
          controller.enqueue({ type: "text-delta", id: activeTextId, text } as T);
          closeText();
        }
        finish("deadline", "deadline");
        try {
          controller.close();
        } catch {
          // Already closed by the deadline watchdog.
        }
      };
      onDeadline = () => {
        if (settled) return;
        emitFallback(released ? "body" : attempt > 0 ? "retry" : "first-token");
      };
      const stopIterator = async (iterator: AsyncIterator<T>, timer?: ReturnType<typeof setTimeout>) => {
        if (timer) clearTimeout(timer);
        await Promise.race([
          Promise.resolve(iterator.return?.()).catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 50)),
        ]);
      };

      const consume = async (scriptRetry: boolean): Promise<"ok" | "timeout" | "script" | "deadline" | "error"> => {
        const budget = scriptRetry ? timeoutMs : firstTokenBudget({ attempt, timeoutMs, startedAt: input.startedAt });
        const settings = chatGenerationSettings(attempt, budget);
        model = settings.model;
        const attemptAbort = new AbortController();
        activeAbort = attemptAbort;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = timeoutError();
            attemptAbort.abort(error);
            reject(error);
          }, budget);
        });
        timeoutPromise.catch(() => undefined);
        const iterator = input.run(attempt, attemptAbort.signal, scriptRetry ? { scriptRetry: true } : undefined)[Symbol.asyncIterator]();
        const buffered: T[] = [];
        const deferred: T[] = [];
        let held = "";
        let partId: string | undefined;
        let sawContent = false;
        const filter = createSystemTextFilter(input.language);
        let showed = false;
        const noteContent = () => {
          if (sawContent) return;
          sawContent = true;
          if (timer) clearTimeout(timer);
        };
        const notePartId = (part: T): T => {
          if (part.type === "text-start") {
            const id = part.id || partId || nextId();
            partId = id;
            return { ...part, id } as T;
          }
          if ((part.type === "text-delta" || part.type === "text-end") && part.id) partId = part.id;
          return part;
        };
        const publishOpen = () => {
          let sawStart = false;
          for (const earlier of buffered) {
            const part = notePartId(earlier);
            if (part.type === "text-end" || part.type === "finish" || part.type === "finish-step" || part.type === "abort") {
              deferred.push(part);
              continue;
            }
            if (part.type === "text-start" && part.id) {
              sawStart = true;
              markOpen(part.id);
            }
            controller.enqueue(part);
          }
          buffered.length = 0;
          if (!sawStart && !textOpen) {
            const id = partId || nextId();
            partId = id;
            markOpen(id);
            controller.enqueue({ type: "text-start", id } as T);
          }
        };
        const writeDelta = (text: string) => {
          if (!text) return;
          const id = activeTextId || partId || nextId();
          if (!textOpen) {
            markOpen(id);
            controller.enqueue({ type: "text-start", id } as T);
          }
          controller.enqueue({ type: "text-delta", id: activeTextId, text } as T);
        };
        const show = (text: string) => {
          const visible = filter.push(text);
          if (!showed) {
            showed = true;
            released = true;
            if (ttftMs === null) ttftMs = Date.now() - origin;
            publishOpen();
          }
          if (visible) writeDelta(visible);
        };
        const flushDeferred = () => {
          let ended = false;
          const pending = deferred.splice(0);
          for (const part of pending) {
            if (part.type === "text-end") {
              ended = true;
              textOpen = false;
            }
            controller.enqueue(part);
          }
          if (!ended) closeText();
        };
        const rememberRatio = (text: string) => {
          const ratio = replyScriptRatio(stripFeeCaveat(text), input.language);
          if (ratio !== null) scriptRatio = ratio;
        };
        try {
          for (;;) {
            if (pastDeadline()) return "deadline";
            const pending = iterator.next();
            pending.catch(() => undefined);
            const step = showed
              ? await Promise.race([pending, deadlinePromise])
              : await Promise.race([pending, timeoutPromise, deadlinePromise]);
            if (step.done) {
              held += takeText("", true);
              const judged = stripFeeCaveat(held);
              const gate = replyScriptGate(judged, input.language, true);
              if (gate === "conflict") {
                const ratio = replyScriptRatio(judged, input.language);
                heldScript = { text: held, ratio };
                scriptRatio = ratio;
                await stopIterator(iterator, timer);
                return "script";
              }
              if (held) {
                rememberRatio(held);
                show(held);
                held = "";
              }
              const rest = filter.flush();
              if (rest) {
                if (!showed) show(rest);
                else writeDelta(rest);
              }
              if (!showed) {
                for (const earlier of buffered) controller.enqueue(notePartId(earlier));
              } else flushDeferred();
              await stopIterator(iterator, timer);
              return "ok";
            }
            const part = step.value;
            if (part.type === "text-delta" && part.text) {
              if (part.id) partId = part.id;
              const visible = takeText(part.text, false);
              if (!visible) continue;
              noteContent();
              if (showed) {
                show(visible);
                continue;
              }
              held += visible;
              const gate = replyScriptGate(held, input.language, false);
              if (gate === "release") {
                rememberRatio(held);
                show(held);
                held = "";
              }
              continue;
            }
            if (!showed) buffered.push(notePartId(part));
            else {
              const forwarded = notePartId(part);
              if (forwarded.type === "text-start" && forwarded.id) markOpen(forwarded.id);
              if (forwarded.type === "text-end") textOpen = false;
              controller.enqueue(forwarded);
            }
          }
        } catch (error) {
          await stopIterator(iterator, timer);
          if (errorName(error) === "DeadlineError" || pastDeadline()) return "deadline";
          if (errorName(error) === "TimeoutError" || errorName(error) === "AbortError") return showed ? "error" : "timeout";
          lastError = error;
          return "error";
        }
      };

      const deadlineStage = (): StalledStage => {
        if (released) return "body";
        if (attempt > 0) return "retry";
        if (input.retrievalTimedOut || retrievalMs >= deadlineMs) return "retrieval";
        return "first-token";
      };

      try {
        let scriptRetried = false;
        for (attempt = 0; attempt < 2; attempt += 1) {
          if (pastDeadline()) {
            emitFallback(deadlineStage());
            return;
          }
          const attemptStarted = Date.now();
          resetTag();
          const result = await consume(false);
          if (result === "deadline") {
            emitFallback(deadlineStage());
            return;
          }
          if (result === "script" && !scriptRetried) {
            scriptRetried = true;
            stalled = "script";
            const firstDraft = heldScript;
            heldScript = null;
            resetTag();
            const again = await consume(true);
            const secondDraft = heldScript as { text: string; ratio: number | null } | null;
            const firstRatio = firstDraft?.ratio ?? -1;
            const secondRatio = secondDraft?.ratio ?? -1;
            const chosen = again === "script" && secondDraft && secondRatio > firstRatio ? secondDraft : firstDraft;
            if (again === "ok") {
              clearDeadline();
              finish("done");
              controller.close();
              return;
            }
            if (chosen?.text) {
              scriptRatio = chosen.ratio;
              publishSaved(chosen.text);
              clearDeadline();
              finish("done");
              controller.close();
              return;
            }
            emitFallback(again === "deadline" && released ? "body" : "script");
            return;
          }
          if (result === "ok") {
            clearDeadline();
            finish("done");
            controller.close();
            return;
          }
          if (result === "timeout") {
            stalled = attempt === 0 ? "first-token" : "retry";
            firstAttemptMs = Date.now() - attemptStarted;
            if (attempt === 1) {
              emitFallback("retry");
              return;
            }
            continue;
          }
          clearDeadline();
          finish("error", errorName(lastError));
          controller.error(lastError ?? new Error("chat stream failed"));
          return;
        }
        clearDeadline();
        finish("error", errorName(lastError));
        controller.error(lastError ?? new Error("chat stream failed"));
      } catch (error) {
        clearDeadline();
        finish("error", errorName(error));
        try {
          controller.error(error);
        } catch {
          // The controller may already be closed.
        }
      }
    },
    cancel() {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      finish("cancelled");
    },
  });
}
