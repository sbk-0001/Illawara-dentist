import type { ClinicFocus } from "../intent";
import type { ClinicId, KnowledgeIndex } from "../types";
import { fillTemplate } from "./fill-template";
import templates from "./templates-v2.json";

const CLINICS: ClinicId[] = ["dapto", "shellharbour", "woonona"];

const ACHE =
  /toothache|tooth ?pain|പല്ലുവേദന|പല്ല്\s*വേദന|വേദനയുണ്ട്|வலிக்கிறது|பல்\s*வலி|दांत का दर्द|दांत में दर्द|দাঁত(?:ে|ের)\s*ব্যথা|ব্যথা করছে|牙痛|牙疼|dolor de muelas|\bduele\b|\bmuela\b|ألم|اسناني|أسناني|الم في|ഇന്ന് അപ്പോയിന്റ്മെന്റ്|same-day appointment|आज अपॉइंटमेंट|আজকে অ্যাপয়েন্টমেন্ট/i;

const WHITEN =
  /whiten|വെളുപ്പി|വെളുപ്പ്|പല്ലു വെളുപ്പ്|வெண்மை|வெண்மையா|दांत सफेद|दांत सफ़ेद|दान सफेद|दान सफ़ेद|দাঁত সাদা|美白|blanque|تبييض|تبيض/i;

const DENIAL = [
  /the website does not list(?: an answer)?[^.।!?。]*/gi,
  /does not list an answer[^.।!?。]*/gi,
  /no information on the (?:website|site)[^.।!?。]*/gi,
  /উত্তর নেই[^.।]*/g,
  /তথ্য নেই[^.।]*/g,
  /ওয়েবসাইটে এই বিষয়ের উত্তর নেই[^.।]*/g,
  /वेबसाइट पर इसका उत्तर नहीं है[^.।]*/g,
  /जानकारी नहीं[^.।]*/g,
  /വെബ്‌സൈറ്റിൽ ഈ ഉത്തരം ഇല്ല[^.।]*/g,
  /വിവരങ്ങൾ ഉണ്ട്[^.।]*/g,
  /வலைத்தளத்தில் இந்த பதில் இல்லை[^.।]*/g,
  /தகவல் உள்ளது[^.।]*/g,
  /网站没有这个问题的答案[^.。]*/g,
  /لا توجد إجابة على الموقع[^.؟]*/g,
  /el sitio no tiene esa respuesta[^.?]*/gi,
];

export function isToothacheQuestion(text: string): boolean {
  return ACHE.test(text) && !WHITEN.test(text);
}

export function isWhiteningQuestion(text: string): boolean {
  return WHITEN.test(text);
}

function idsFor(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  if (focus.kind === "many") return focus.clinics;
  return CLINICS;
}

function bookings(index: KnowledgeIndex, ids: ClinicId[]): string {
  return ids
    .map((id) => {
      const card = index.contacts[id];
      return card?.bookingUrl ? `${card.name} ${card.bookingUrl}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function acheReply(code: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  const ids = idsFor(focus);
  const one = templates.ACHE_ONE[code as keyof typeof templates.ACHE_ONE] ?? templates.ACHE_ONE.en;
  const line = templates.ACHE_LINE[code as keyof typeof templates.ACHE_LINE] ?? templates.ACHE_LINE.en;
  if (ids.length === 1) {
    const card = index.contacts[ids[0]];
    return fillTemplate(one[ids[0]], { clinic: card?.name ?? "", phone: card?.phone ?? "" });
  }
  const lead = templates.ACHE_LEAD[code as keyof typeof templates.ACHE_LEAD] ?? templates.ACHE_LEAD.en;
  const rows = ids
    .map((id) => {
      const card = index.contacts[id];
      return fillTemplate(line[id], { clinic: card?.name ?? "", phone: card?.phone ?? "" });
    })
    .join("\n");
  return `${lead}\n${rows}`;
}

export function whiteningReply(code: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  const ids = idsFor(focus);
  const one = templates.WHITE_ONE[code as keyof typeof templates.WHITE_ONE] ?? templates.WHITE_ONE.en;
  const body =
    focus.kind === "any" || ids.length >= 3
      ? (templates.WHITE_ALL[code as keyof typeof templates.WHITE_ALL] ?? templates.WHITE_ALL.en)
      : ids.map((id) => one[id]).filter(Boolean).join("\n");
  return `${body}\n${bookings(index, ids)}`.trim();
}

function hasConcreteAnswer(text: string): boolean {
  return /02\s*\d{4}\s*\d{4}|https?:\/\/|\$\s?\d|Baan Baan|Princes Highway|Captain Cook|\b(?:am|pm)\b|മണി|மணி|बजे|টা|点/i.test(text);
}

/** A reply that already gives the fact must not also say the website has no answer. */
export function dropDenialBesideAnswer(text: string): string {
  if (!hasConcreteAnswer(text)) return text;
  let out = text;
  for (const pattern of DENIAL) out = out.replace(pattern, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.!?।。])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}
