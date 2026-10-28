import type { ClinicFocus } from "../intent";
import type { ClinicId, KnowledgeIndex } from "../types";
import { addressReply, isAddressQuestion } from "./address";
import { acheReply, isToothacheQuestion, isWhiteningQuestion, whiteningReply } from "./care-reply";
import { hoursReply, questionAsksHours } from "./hours";
import { implantPriceSentence, isImplantPriceQuestion } from "./implant-price";
import { phoneReply } from "./label-fix";

const PHONE_QUESTION = /\b(?:phone|telephone)s?\b|ഫോൺ|फोन|फ़ोन|ফোন|தொலைபேசி|电话|هاتف|tel[eé]fono/i;
const ALT_PHONE = /other (?:phone|number)|alternative|another (?:phone|number)|second (?:phone|number)|all (?:the )?(?:phone )?numbers/i;

/** A phone question that is not asking for a second published number. */
export function isPhoneQuestion(text: string): boolean {
  return PHONE_QUESTION.test(text) && !ALT_PHONE.test(text);
}

function clinicIds(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  if (focus.kind === "many") return focus.clinics;
  return ["dapto", "shellharbour", "woonona"];
}

function bookingLines(index: KnowledgeIndex, focus: ClinicFocus): string {
  return clinicIds(focus)
    .map((id) => {
      const card = index.contacts[id];
      return card?.bookingUrl ? `${card.name} ${card.bookingUrl}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export type CoreIntent = "ache" | "white" | "implant" | "hours" | "address" | "phone";

/** Which fixed reply a question gets. Null means the model still answers. */
export function coreIntent(question: string): CoreIntent | null {
  if (isToothacheQuestion(question)) return "ache";
  if (isWhiteningQuestion(question)) return "white";
  if (isImplantPriceQuestion(question)) return "implant";
  if (questionAsksHours(question)) return "hours";
  if (isAddressQuestion(question)) return "address";
  if (isPhoneQuestion(question)) return "phone";
  return null;
}

/**
 * Hours, address, phone, toothache, whitening and implant cost are fixed
 * sentences. Everything else still goes to the model.
 */
export function coreTemplate(question: string, code: string, focus: ClinicFocus, index: KnowledgeIndex): string | null {
  const intent = coreIntent(question);
  if (intent === "ache") return acheReply(code, focus, index);
  if (intent === "white") return whiteningReply(code, focus, index);
  if (intent === "implant") {
    const price = implantPriceSentence(code, focus);
    const book = bookingLines(index, focus);
    return book ? `${price}\n${book}` : price;
  }
  if (intent === "hours") return hoursReply(code, focus, question);
  if (intent === "address") return addressReply(code, index, focus);
  if (intent === "phone") return phoneReply(code, index, focus);
  return null;
}
