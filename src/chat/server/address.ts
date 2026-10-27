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

const ADDRESS_SENTENCE: Record<string, (name: string, address: string) => string> = {
  bn: (name, address) => `${name}-এর ঠিকানা হলো ${address}।`,
  "bn-Latn": (name, address) => `${name} er thikana holo ${address}.`,
  hi: (name, address) => `${name} का पता ${address} है।`,
  "hi-Latn": (name, address) => `${name} ka pata ${address} hai.`,
  zh: (name, address) => `${name}的地址是 ${address}。`,
  es: (name, address) => `La dirección de ${name} es ${address}.`,
  ar: (name, address) => `عنوان ${name} هو ${address}.`,
  fa: (name, address) => `آدرس ${name} ${address} است.`,
  ur: (name, address) => `${name} کا پتہ ${address} ہے۔`,
  ko: (name, address) => `${name}의 주소는 ${address}입니다.`,
  vi: (name, address) => `Địa chỉ của ${name} là ${address}.`,
  fr: (name, address) => `L'adresse de ${name} est ${address}.`,
  de: (name, address) => `Die Adresse von ${name} ist ${address}.`,
  pt: (name, address) => `O endereço de ${name} é ${address}.`,
  it: (name, address) => `L'indirizzo di ${name} è ${address}.`,
  el: (name, address) => `Η διεύθυνση του ${name} είναι ${address}.`,
  ja: (name, address) => `${name}の住所は ${address} です。`,
  ru: (name, address) => `Адрес ${name}: ${address}.`,
  th: (name, address) => `ที่อยู่ของ ${name} คือ ${address}`,
  ne: (name, address) => `${name} को ठेगाना ${address} हो।`,
};

const NATIVE_ADDRESS: Record<string, RegExp> = {
  bn: /[\u0980-\u09FF]/,
  hi: /[\u0900-\u097F]/,
  ne: /[\u0900-\u097F]/,
  ar: /[\u0600-\u06FF]/,
  ur: /[\u0600-\u06FF]/,
  fa: /[\u0600-\u06FF]/,
  he: /[\u0590-\u05FF]/,
  zh: /[\u4E00-\u9FFF]/,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/,
  ko: /[\uAC00-\uD7AF]/,
  el: /[\u0370-\u03FF]/,
  ru: /[\u0400-\u04FF]/,
  th: /[\u0E00-\u0E7F]/,
  pa: /[\u0A00-\u0A7F]/,
  ta: /[\u0B80-\u0BFF]/,
  te: /[\u0C00-\u0C7F]/,
};

function addressSentence(code: string, name: string, address: string): string {
  const write = ADDRESS_SENTENCE[code];
  if (write) return write(name, address);
  const label = directoryLabels(code).address.replace(/[:：]\s*$/u, "");
  return `${name}: ${label} ${address}.`;
}

function needsNativeAddress(reply: string, code: string): boolean {
  const native = NATIVE_ADDRESS[code];
  if (!native) return false;
  return !native.test(reply);
}

function addressBlock(index: KnowledgeIndex, code: string, ids: ClinicId[]): string {
  return ids
    .map((id) => {
      const card = index.contacts[id];
      return card?.address ? addressSentence(code, card.name, card.address) : "";
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
  if (!missing.length) {
    if (!needsNativeAddress(reply, code)) return reply;
    const spoken = addressBlock(index, code, ids);
    return spoken || reply;
  }
  const block = addressBlock(index, code, missing.length === ids.length || needsNativeAddress(reply, code) ? ids : missing);
  if (!block) return reply;
  if (!reply.trim() || phoneOnly(reply) || needsNativeAddress(reply, code)) return block;
  return `${reply.trim()}\n${block}`;
}
