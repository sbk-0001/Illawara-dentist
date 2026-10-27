import type { KnowledgeIndex } from "../types";
import { directoryLabels } from "./contacts";

const ENGLISH_LABEL = "(?:phone|booking|email|address)";
const LINE_LABEL = new RegExp(`^(${ENGLISH_LABEL})\\s*[:：]\\s*(\\S.*)$`, "i");
const LABEL_PREFIX = /^(?:p(?:h(?:o(?:n(?:e)?)?)?)?|b(?:o(?:o(?:k(?:i(?:n(?:g)?)?)?)?)?)?|e(?:m(?:a(?:i(?:l)?)?)?)?|a(?:d(?:d(?:r(?:e(?:s(?:s)?)?)?)?)?)?)?$/i;
const OPEN_LABEL = new RegExp(`^${ENGLISH_LABEL}\\s*[:：]?\\s*[\\d\\s()+./:@-]*$`, "i");

type LabelKey = "phone" | "booking" | "email" | "address";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function rewriteContactLabels(text: string, code: string): string {
  if (!code || code === "en" || code === "und") return text;
  const labels = directoryLabels(code);
  return text.replace(/(^|\n)([ \t]*)(phone|booking|email|address)[ \t]*[:：][ \t]*/gi, (_all, brk: string, space: string, word: string) => {
    const key = word.toLowerCase() as LabelKey;
    return `${brk}${space}${labels[key]} `;
  });
}

const BARE_REPLY_MAX = 60;

function normalizeLabel(value: string): string {
  return value.replace(/[:：]\s*$/u, "").trim().toLowerCase();
}

function knownLabels(code: string): string[] {
  const labels = directoryLabels(!code || code === "und" ? "en" : code);
  return [...new Set(["phone", "booking", "email", "address", labels.phone, labels.booking, labels.email, labels.address].map(normalizeLabel))];
}

/** One short `label: value` line, in English or the reply language. */
export function isLabelValueLine(line: string, code: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length >= BARE_REPLY_MAX) return false;
  const match = trimmed.match(/^([^:：\n]{1,32}?)\s*[:：]\s*(\S[\s\S]*)$/);
  if (!match) return false;
  const label = match[1].trim();
  const value = match[2].trim();
  if (!label || !value || label.split(/\s+/).length > 3) return false;
  const known = knownLabels(code).includes(normalizeLabel(label));
  const contactValue = /\d[\d\s()-]{8,}\d/.test(value) || /@/.test(value) || /https?:|zavy360/i.test(value);
  if (known) return true;
  return contactValue && label.split(/\s+/).length === 1 && label.length <= 16;
}

/** The finished reply is only contact lines and is short enough to need a sentence. */
export function isShortLabelReply(text: string, code: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length >= BARE_REPLY_MAX) return false;
  const lines = trimmed.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 3) return false;
  return lines.every((line) => isLabelValueLine(line, code));
}

function isPendingLabel(line: string, code: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40 || /[.!?।,]/.test(trimmed)) return false;
  if (isLabelValueLine(trimmed, code)) return true;
  const head = trimmed.replace(/\s*[:：].*$/, "").trim().toLowerCase();
  if (!head || head.split(/\s+/).length > 2) return false;
  return knownLabels(code).some((label) => label.startsWith(head) || head.startsWith(label));
}

/** True while the text so far could still be only a short label line. A sentence is released. */
export function mayBeShortLabelReply(text: string, code: string): boolean {
  if (text.length >= BARE_REPLY_MAX) return false;
  const parts = text.split("\n");
  const complete = parts.slice(0, -1).map((line) => line.trim()).filter(Boolean);
  if (complete.some((line) => !isLabelValueLine(line, code))) return false;
  const last = (parts[parts.length - 1] ?? "").trim();
  if (!last) return complete.length > 0;
  return isPendingLabel(last, code);
}

/** A reply that is only a phone, email, address or booking line, with no sentence. */
export function isOnlyContactLine(text: string): boolean {
  const lines = text.trim().split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 3) return false;
  return lines.every((line) => {
    if (line.length > 140) return false;
    const letters = line.match(/\p{L}/gu)?.length ?? 0;
    const words = line.split(/\s+/).filter(Boolean).length;
    const hasRoute = /\d[\d\s()-]{8,}\d/.test(line) || /@/.test(line) || /zavy360|https?:/i.test(line);
    return hasRoute && letters <= 24 && words <= 8;
  });
}

/** True while the text so far could still turn out to be only a contact line. */
export function mayBeOnlyContact(text: string): boolean {
  if (text.length > 200) return false;
  const parts = text.split("\n");
  const complete = parts.slice(0, -1).map((line) => line.trim()).filter(Boolean);
  if (complete.length && !isOnlyContactLine(complete.join("\n"))) return false;
  const last = (parts[parts.length - 1] ?? "").trim();
  if (!last) return true;
  if (isOnlyContactLine(last)) return true;
  if (LABEL_PREFIX.test(last) || OPEN_LABEL.test(last)) return true;
  return false;
}

function clinicForPhone(index: KnowledgeIndex, text: string): { name: string; phone: string } | undefined {
  const flat = digits(text);
  for (const card of Object.values(index.contacts)) {
    const phone = digits(card.phone);
    if (phone.length >= 10 && flat.includes(phone)) return { name: card.name, phone: card.phone };
  }
  return undefined;
}

function phoneSentence(code: string, clinic: string, phone: string): string {
  const named = clinic.length > 0;
  const table: Record<string, [string, string]> = {
    en: [`The phone number for ${clinic} is ${phone}.`, `The phone number is ${phone}.`],
    bn: [`${clinic}-এর ফোন নম্বর ${phone}।`, `ফোন নম্বর ${phone}।`],
    "bn-Latn": [`${clinic} er phone number ${phone}.`, `Phone number ${phone}.`],
    ar: [`رقم هاتف ${clinic} هو ${phone}.`, `رقم الهاتف هو ${phone}.`],
    hi: [`${clinic} का फ़ोन नंबर ${phone} है।`, `फ़ोन नंबर ${phone} है।`],
    "hi-Latn": [`${clinic} ka phone number ${phone} hai.`, `Phone number ${phone} hai.`],
    zh: [`${clinic}的电话号码是 ${phone}。`, `电话号码是 ${phone}。`],
    es: [`El teléfono de ${clinic} es ${phone}.`, `El teléfono es ${phone}.`],
    vi: [`Số điện thoại của ${clinic} là ${phone}.`, `Số điện thoại là ${phone}.`],
    ne: [`${clinic} को फोन नम्बर ${phone} हो।`, `फोन नम्बर ${phone} हो।`],
    ko: [`${clinic}의 전화번호는 ${phone}입니다.`, `전화번호는 ${phone}입니다.`],
    el: [`Το τηλέφωνο του ${clinic} είναι ${phone}.`, `Το τηλέφωνο είναι ${phone}.`],
    it: [`Il numero di ${clinic} è ${phone}.`, `Il numero è ${phone}.`],
    ur: [`${clinic} کا فون نمبر ${phone} ہے۔`, `فون نمبر ${phone} ہے۔`],
    fa: [`شماره تلفن ${clinic} ${phone} است.`, `شماره تلفن ${phone} است.`],
    he: [`מספר הטלפון של ${clinic} הוא ${phone}.`, `מספר הטלפון הוא ${phone}.`],
    fr: [`Le numéro de ${clinic} est ${phone}.`, `Le numéro est ${phone}.`],
    de: [`Die Telefonnummer von ${clinic} ist ${phone}.`, `Die Telefonnummer ist ${phone}.`],
    pt: [`O telefone de ${clinic} é ${phone}.`, `O telefone é ${phone}.`],
    ja: [`${clinic}の電話番号は ${phone} です。`, `電話番号は ${phone} です。`],
    id: [`Nomor telepon ${clinic} adalah ${phone}.`, `Nomor teleponnya adalah ${phone}.`],
    ms: [`Nombor telefon ${clinic} ialah ${phone}.`, `Nombor telefon ialah ${phone}.`],
    pa: [`${clinic} ਦਾ ਫ਼ੋਨ ਨੰਬਰ ${phone} ਹੈ।`, `ਫ਼ੋਨ ਨੰਬਰ ${phone} ਹੈ।`],
    ta: [`${clinic} தொலைபேசி எண் ${phone}.`, `தொலைபேசி எண் ${phone}.`],
    te: [`${clinic} ఫోన్ నంబర్ ${phone}.`, `ఫోన్ నంబర్ ${phone}.`],
    ru: [`Телефон ${clinic}: ${phone}.`, `Телефон: ${phone}.`],
    th: [`เบอร์โทรของ ${clinic} คือ ${phone}`, `เบอร์โทรคือ ${phone}`],
  };
  const pair = table[code] ?? table.en;
  return named ? pair[0] : pair[1];
}

export function bareContactPreface(code: string, text: string, index: KnowledgeIndex): string {
  const found = clinicForPhone(index, text);
  const phone = found?.phone ?? text.match(/\d[\d\s()-]{8,}\d/)?.[0]?.replace(/\s+/g, " ").trim();
  if (!phone) return "";
  return phoneSentence(code, found?.name ?? "", phone);
}

type LabelChunk = { type: string; id?: string; delta?: string };

/**
 * Rewrite line-leading English contact labels for a non-English reply.
 * A finished reply that is only a short label line gets one localized sentence,
 * whether or not the status tag was present. A real sentence is not held.
 */
export function attachContactLabels<T extends LabelChunk>(
  stream: ReadableStream<T>,
  input: {
    code: string;
    index: KnowledgeIndex;
    replyStatus: { missing: boolean };
  },
): ReadableStream<T> {
  let textId: string | undefined;
  let held = "";
  let passed = false;
  let lineHold = "";
  let sealed = false;

  const rewritePass = (delta: string): string => {
    if (input.code === "en" || input.code === "und") return lineHold + delta;
    const combined = lineHold + delta;
    lineHold = "";
    const nl = combined.lastIndexOf("\n");
    const done = nl >= 0 ? combined.slice(0, nl + 1) : "";
    let rest = nl >= 0 ? combined.slice(nl + 1) : combined;
    const match = rest.match(LINE_LABEL);
    if (match) {
      const rewritten = rewriteContactLabels(rest.slice(0, match[0].length), input.code);
      return rewriteContactLabels(done, input.code) + rewritten + rest.slice(match[0].length);
    }
    const word = rest.trimStart();
    if (word.length > 0 && word.length <= 10 && (LABEL_PREFIX.test(word) || OPEN_LABEL.test(word)) && !rest.includes("\n")) {
      lineHold = rest;
      return rewriteContactLabels(done, input.code);
    }
    return rewriteContactLabels(combined, input.code);
  };

  const releaseHeld = (): string => {
    const raw = held;
    held = "";
    if (!raw) return "";
    const body = rewriteContactLabels(raw, input.code);
    const bare = isShortLabelReply(body, input.code) || isShortLabelReply(raw, input.code) || (input.replyStatus.missing && isOnlyContactLine(raw));
    if (bare) {
      const preface = bareContactPreface(input.code, raw, input.index);
      if (preface) return `${preface}\n${body}`;
    }
    return body;
  };

  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type !== "text-delta" || typeof chunk.delta !== "string") {
          if (chunk.type === "text-end" || chunk.type === "finish") {
            if (!sealed) {
              sealed = true;
              const tail = `${releaseHeld()}${lineHold ? rewriteContactLabels(lineHold, input.code) : ""}`;
              lineHold = "";
              if (tail && textId) controller.enqueue({ type: "text-delta", id: textId, delta: tail } as T);
            }
          }
          controller.enqueue(chunk);
          return;
        }
        if (!passed) {
          held += chunk.delta;
          const pending = mayBeShortLabelReply(held, input.code) || (input.replyStatus.missing && mayBeOnlyContact(held));
          if (pending && held.length < 80) return;
          passed = true;
          const visible = releaseHeld();
          if (visible) controller.enqueue({ ...chunk, delta: visible });
          return;
        }
        const visible = rewritePass(chunk.delta);
        if (visible) controller.enqueue({ ...chunk, delta: visible });
      },
      flush(controller) {
        if (sealed) return;
        sealed = true;
        const tail = `${releaseHeld()}${lineHold ? rewriteContactLabels(lineHold, input.code) : ""}`;
        lineHold = "";
        if (tail && textId) controller.enqueue({ type: "text-delta", id: textId, delta: tail } as T);
      },
    }),
  );
}
