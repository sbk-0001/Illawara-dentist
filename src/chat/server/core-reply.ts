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

/**
 * Hours, address, phone, toothache, whitening and implant cost are fixed
 * sentences. Everything else still goes to the model.
 */
export function coreTemplate(question: string, code: string, focus: ClinicFocus, index: KnowledgeIndex): string | null {
  if (isToothacheQuestion(question)) return acheReply(code, focus, index);
  if (isWhiteningQuestion(question)) return whiteningReply(code, focus, index);
  if (isImplantPriceQuestion(question)) {
    const price = implantPriceSentence(code, focus);
    const book = bookingLines(index, focus);
    return book ? `${price}\n${book}` : price;
  }
  if (questionAsksHours(question)) return hoursReply(code, focus, question);
  if (isAddressQuestion(question)) return addressReply(code, index, focus);
  if (isPhoneQuestion(question)) return phoneReply(code, index, focus);
  return null;
}
