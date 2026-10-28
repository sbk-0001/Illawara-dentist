import type { ClinicFocus } from "../intent";
import type { KnowledgeIndex } from "../types";

const CLINIC_NAME = /Dapto Dentists|Shellharbour Dentists|Woonona Dentists/g;

const GROUP: Record<string, string> = {
  en: "all three clinics",
  ml: "മൂന്ന് ക്ലിനിക്കുകളിലും",
  ta: "மூன்று கிளினிக்குகளிலும்",
  hi: "तीनों क्लिनिकों में",
  bn: "তিনটি ক্লিনিকেই",
  ar: "العيادات الثلاث",
  zh: "三家诊所",
  es: "las tres clínicas",
};

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?।。])/g, "$1")
    .replace(/([,.;:])\s*(?=[,.;:])/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contactLine(index: KnowledgeIndex): string {
  return (["dapto", "shellharbour", "woonona"] as const)
    .map((id) => {
      const card = index.contacts[id];
      return card ? `${card.name} ${card.phone}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

/**
 * When the visitor named no clinic, the body says "all three clinics" once
 * and one final line lists each clinic and its phone once.
 */
export function enforceGroupReply(text: string, code: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  if (focus.kind !== "any") return text;
  if (!CLINIC_NAME.test(text)) return text;
  CLINIC_NAME.lastIndex = 0;
  let used = false;
  const phrase = GROUP[code] ?? GROUP.en ?? "all three clinics";
  const body = tidy(
    text.replace(CLINIC_NAME, () => {
      if (used) return "";
      used = true;
      return phrase;
    }),
  );
  const line = contactLine(index);
  if (body.includes(line)) return body;
  return tidy(`${body}\n${line}`);
}
