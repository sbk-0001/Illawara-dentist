import { lastMentionedClinic, mentionedClinics, type ClinicFocus } from "../intent";
import type { ClinicId, KnowledgeIndex } from "../types";
import { directoryLabels } from "./contacts";

const ALL_CLINICS: ClinicId[] = ["dapto", "shellharbour", "woonona"];

/** Address or where, including Bengali ঠিকানা / কোথায়. Not a general hours question. */
export function isAddressQuestion(text: string): boolean {
  return /ঠিকানা|কোথায়|\bthikana\b|\bkothay\b|\bkothai\b|\bwhere\b|\baddress\b|地址|哪里|哪儿|पता|कहाँ|कहां|عنوان|أين|주소|어디|địa chỉ|ở đâu|διεύθυνση|indirizzo|dirección|endereço|\badresse\b|\balamat\b|آدرس|پتہ|כתובת/i.test(
    text,
  );
}

/**
 * An address question that names no clinic uses the clinic mentioned most
 * recently in the conversation. With no prior clinic, list all three.
 */
export function addressFocus(question: string, priorTexts: readonly string[], current: ClinicFocus): ClinicFocus {
  if (!isAddressQuestion(question) || mentionedClinics(question).length > 0) return current;
  const recent = lastMentionedClinic(priorTexts);
  if (recent) return { kind: "one", clinic: recent };
  return { kind: "many", clinics: [...ALL_CLINICS] };
}

export function addressClinicIds(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  if (focus.kind === "many") return focus.clinics;
  return [...ALL_CLINICS];
}

function hasStreet(reply: string, address: string): boolean {
  const street = address.split(",")[0]?.trim().toLowerCase() ?? "";
  return street.length > 6 && reply.toLowerCase().includes(street);
}

function phoneOnly(text: string): boolean {
  const lines = text.trim().split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 3) return false;
  return lines.every((line) => {
    const letters = line.match(/\p{L}/gu)?.length ?? 0;
    const hasRoute = /\d[\d\s()-]{8,}\d/.test(line) || /@/.test(line) || /zavy360|https?:/i.test(line);
    return hasRoute && letters <= 24;
  });
}

function addressBlock(index: KnowledgeIndex, code: string, ids: ClinicId[]): string {
  const label = directoryLabels(code).address;
  return ids
    .map((id) => {
      const card = index.contacts[id];
      return card?.address ? `${card.name}: ${label} ${card.address}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * An address question has to include the street address.
 * A phone-only reply is replaced. A longer reply that missed the street gets the address appended.
 */
export function ensureAddressReply(
  reply: string,
  question: string,
  code: string,
  index: KnowledgeIndex,
  focus: ClinicFocus,
): string {
  if (!isAddressQuestion(question)) return reply;
  const ids = addressClinicIds(focus);
  const missing = ids.filter((id) => {
    const address = index.contacts[id]?.address;
    return !address || !hasStreet(reply, address);
  });
  if (!missing.length) return reply;
  const block = addressBlock(index, code, missing);
  if (!block) return reply;
  if (!reply.trim() || phoneOnly(reply)) return block;
  return `${reply.trim()}\n${block}`;
}
