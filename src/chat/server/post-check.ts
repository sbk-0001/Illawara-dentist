import type { ClinicFocus } from "../intent";
import type { KnowledgeIndex } from "../types";
import { dropDenialBesideAnswer } from "./care-reply";
import { coreTemplate } from "./core-reply";

type PostChunk = { type: string; id?: string; delta?: string; text?: string };

/** Finished-reply fixes that have to see the whole answer. Core intents replace the model text. Nothing is deleted from an off-script reply. */
export function postCheckReply(text: string, code: string, question: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  const templated = coreTemplate(question, code, focus, index);
  if (templated) return dropDenialBesideAnswer(templated);
  return dropDenialBesideAnswer(text);
}

export function attachReplyPostCheck<T extends PostChunk>(
  stream: ReadableStream<T>,
  input: { code: string; question: string; focus: ClinicFocus; index: KnowledgeIndex },
): ReadableStream<T> {
  if (!coreTemplate(input.question, input.code, input.focus, input.index)) return stream;
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
