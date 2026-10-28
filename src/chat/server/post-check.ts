import type { ClinicFocus } from "../intent";
import type { KnowledgeIndex } from "../types";
import { acheReply, dropDenialBesideAnswer, isToothacheQuestion, isWhiteningQuestion, whiteningReply } from "./care-reply";
import { enforceGroupReply } from "./group-reply";
import { guardUnclearDay, questionAsksHours } from "./hours";
import { guardImplantPrice, isImplantPriceQuestion } from "./implant-price";

type PostChunk = { type: string; id?: string; delta?: string; text?: string };

/** Finished-reply fixes that have to see the whole answer. */
export function postCheckReply(text: string, code: string, question: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  if (isToothacheQuestion(question)) return acheReply(code, focus, index);
  if (isWhiteningQuestion(question)) return whiteningReply(code, focus, index);
  const priced = guardImplantPrice(text, question, code, focus);
  const body = priced !== text ? priced : guardUnclearDay(text, question, code);
  const grouped = body === text ? enforceGroupReply(text, code, focus, index) : body;
  return dropDenialBesideAnswer(grouped);
}

export function attachReplyPostCheck<T extends PostChunk>(
  stream: ReadableStream<T>,
  input: { code: string; question: string; focus: ClinicFocus; index: KnowledgeIndex },
): ReadableStream<T> {
  const hold =
    input.focus.kind === "any" ||
    isImplantPriceQuestion(input.question) ||
    questionAsksHours(input.question) ||
    isToothacheQuestion(input.question) ||
    isWhiteningQuestion(input.question);
  if (!hold) return stream;
  let textId: string | undefined;
  let held = "";
  let sealed = false;
  const emit = (controller: TransformStreamDefaultController<T>) => {
    if (sealed) return;
    sealed = true;
    const next = postCheckReply(held, input.code, input.question, input.focus, input.index);
    if (!next) return;
    if (!textId) {
      textId = "post";
      controller.enqueue({ type: "text-start", id: textId } as T);
    }
    controller.enqueue({ type: "text-delta", id: textId, delta: next } as T);
  };
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
          held += chunk.delta;
          return;
        }
        if (chunk.type === "text-end" || chunk.type === "finish") emit(controller);
        controller.enqueue(chunk);
      },
      flush(controller) {
        emit(controller);
      },
    }),
  );
}
