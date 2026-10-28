import { mentionsIndexedTopic } from "../retrieval/search";
import { isAddressQuestion } from "./address";
import { questionAsksHours } from "./hours";

const PHONE = /phone|ഫോൺ|फोन|फ़ोन|ফোন|தொலைபேசி|电话|هاتف/i;

/**
 * Mixed Latin and Indic with no hours, address, phone, or known service.
 * The reply should ask what the visitor meant instead of guessing a treatment.
 */
export function needsClarification(text: string): boolean {
  const value = text.trim();
  if (value.length < 8) return false;
  if (questionAsksHours(value) || isAddressQuestion(value) || PHONE.test(value)) return false;
  if (mentionsIndexedTopic(value).length > 0) return false;
  const native = value.match(/[\u0D00-\u0D7F\u0B80-\u0BFF\u0980-\u09FF\u0900-\u097F]/g)?.length ?? 0;
  const latin = value.match(/[A-Za-z]{3,}/g)?.length ?? 0;
  return native >= 4 && latin > 0;
}
