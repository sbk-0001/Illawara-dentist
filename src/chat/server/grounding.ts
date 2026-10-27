import type { ClinicId, KnowledgeIndex } from "../types";

const FAKE_PHONE = "0242105301";
const DIAGNOSIS = [/you have an abscess/i, /this is an infection/i, /take antibiotics/i, /you should take ibuprofen/i, /i diagnose/i];

function digits(value: string): string {
  let next = value.replace(/\D/g, "");
  if (next.startsWith("61") && next.length >= 11) next = `0${next.slice(2)}`;
  return next;
}

function indexPhones(index: KnowledgeIndex): Set<string> {
  const phones = new Set<string>();
  for (const contact of Object.values(index.contacts)) {
    if (contact.phoneDigits) phones.add(contact.phoneDigits);
    for (const other of contact.otherPhones) {
      const normalised = digits(other);
      if (normalised.length === 10) phones.add(normalised);
    }
  }
  return phones;
}

function indexMoney(index: KnowledgeIndex): Set<string> {
  const blob = index.chunks.map((chunk) => chunk.text).join("\n");
  const amounts = new Set<string>();
  for (const match of blob.matchAll(/\$\s?(\d{1,5}(?:\.\d{2})?)/g)) {
    if (match[1]) amounts.add(match[1].replace(/\.00$/, ""));
  }
  return amounts;
}

function corpusFor(index: KnowledgeIndex, clinic?: ClinicId): string {
  const chunks = clinic ? index.chunks.filter((chunk) => chunk.clinic === clinic) : index.chunks;
  const contacts = clinic ? [index.contacts[clinic]] : Object.values(index.contacts);
  return `${chunks.map((chunk) => `${chunk.text} ${chunk.heading}`).join("\n")}\n${contacts.map((contact) => contact.hours).join("\n")}`.toLowerCase();
}

function timeAllowed(token: string, corpus: string): boolean {
  const match = token.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return true;
  const hour = Number(match[1]);
  const minute = match[2] || "00";
  const suffix = match[3] || "";
  const variants = new Set<string>();
  const add = (h: number, suf: string) => {
    if (h < 0 || h > 23) return;
    const hh = String(h).padStart(2, "0");
    variants.add(`${h}${suf}`);
    variants.add(`${h}:${minute}${suf}`);
    variants.add(`${h}.${minute}${suf}`);
    variants.add(`${hh}:${minute}${suf}`);
    variants.add(`${h}:${minute}`);
    variants.add(`${hh}:${minute}`);
    variants.add(`${h}.${minute}`);
  };
  add(hour, suffix);
  if (suffix === "pm" && hour < 12) add(hour + 12, "");
  if (suffix === "am" && (hour === 12 || hour === 0)) add(0, "");
  if (!suffix && hour >= 13) add(hour - 12, "pm");
  if (!suffix && hour === 0) add(12, "am");
  const flat = corpus.replace(/\s+/g, "");
  for (const variant of variants) {
    const compact = variant.replace(/\s+/g, "");
    if (compact.length < 3) continue;
    if (corpus.includes(variant) || flat.includes(compact)) return true;
  }
  return false;
}

export type GroundingKind = "fee" | "hours" | "emergency" | "unknown" | "offtopic";

export function checkGrounding(reply: string, index: KnowledgeIndex, kind: GroundingKind, clinic?: ClinicId): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const replyDigits = digits(reply);
  if (replyDigits.includes(FAKE_PHONE) || reply.includes("4210 5301") || reply.includes("42105301")) {
    reasons.push("reply includes the concept mock phone 02 4210 5301");
  }
  const phones = indexPhones(index);
  for (const match of reply.matchAll(/(?:\+?61[\s-]*)?(?:\(?0\d\)?[\s-]*)\d(?:[\s-]?\d){7,8}/g)) {
    const phone = digits(match[0]);
    if (phone === "000" || phone.length < 10) continue;
    const last10 = phone.slice(-10);
    if (!phones.has(last10)) reasons.push(`phone ${match[0]} is not in the index`);
  }
  const money = indexMoney(index);
  for (const match of reply.matchAll(/\$\s?(\d{1,5}(?:\.\d{2})?)/g)) {
    const amount = match[1]?.replace(/\.00$/, "") || "";
    if (amount && !money.has(amount)) reasons.push(`price $${amount} is not in the index`);
  }
  for (const pattern of DIAGNOSIS) {
    if (pattern.test(reply)) reasons.push(`diagnosis wording: ${pattern}`);
  }
  if (kind === "emergency" || kind === "unknown") {
    const hasContact =
      [...phones].some((phone) => replyDigits.includes(phone)) ||
      reply.toLowerCase().includes("zavy360.com") ||
      Object.values(index.contacts).some((contact) => contact.email && reply.toLowerCase().includes(contact.email.toLowerCase())) ||
      (kind === "emergency" && /\b000\b/.test(reply));
    if (!hasContact) reasons.push("missing a real clinic phone, email, booking link, or 000");
  }
  if (kind === "offtopic" && /argentina|messi|mbapp[eé]/i.test(reply)) {
    reasons.push("off-topic reply answered the trivia");
  }
  if (kind === "hours" && clinic) {
    const corpus = corpusFor(index, clinic);
    for (const match of reply.matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi)) {
      if (!timeAllowed(match[0], corpus)) reasons.push(`time ${match[0]} is not in ${clinic} pages`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
