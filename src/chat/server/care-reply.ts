import type { ClinicFocus } from "../intent";
import type { ClinicId, KnowledgeIndex } from "../types";

const CLINICS: ClinicId[] = ["dapto", "shellharbour", "woonona"];

const ACHE =
  /toothache|tooth ?pain|പല്ലുവേദന|വേദനയുണ്ട്|பல்\s*வலி|दांत का दर्द|দাঁতের ব্যথা|牙痛|dolor de muelas|ألم الأسنان|ഇന്ന് അപ്പോയിന്റ്മെന്റ്|same-day appointment|आज अपॉइंटमेंट|আজকে অ্যাপয়েন্টমেন্ট/i;

const WHITEN =
  /whiten|വെളുപ്പ്|வெண்மை|வெண்மையா|दांत सफेद|दांत सफ़ेद|দাঁত সাদা|美白|blanque|تبييض|تبيض/i;

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

type AcheLine = (clinic: string, phone: string) => string;

const ACHE_ONE: Record<string, AcheLine> = {
  en: (clinic, phone) =>
    `Sorry about the pain. ${clinic} keeps emergency appointments and will try to see you today. Please call now on ${phone}.`,
  ml: (clinic, phone) =>
    `വേദനയിൽ ഖേദിക്കുന്നു. ${clinic} അടിയന്തര സമയം വെച്ചിട്ടുണ്ട്, ഇന്ന് കാണാൻ ശ്രമിക്കാം. ദയവായി ഇപ്പോൾ ${phone} നമ്പറിൽ വിളിക്കൂ.`,
  ta: (clinic, phone) =>
    `வலிக்கு வருந்துகிறோம். ${clinic} அவசர நேரம் வைத்திருக்கிறது, இன்று பார்க்க முயற்சிப்போம். தயவுசெய்து இப்போது ${phone} எண்ணில் அழைக்கவும்.`,
  hi: (clinic, phone) =>
    `दर्द के लिए खेद है। ${clinic} इमरजेंसी अपॉइंटमेंट रखता है और आज देखने की कोशिश करेगा। कृपया अभी ${phone} पर कॉल करें।`,
  bn: (clinic, phone) =>
    `ব্যথার জন্য দুঃখিত। ${clinic} জরুরি অ্যাপয়েন্টমেন্ট রাখে এবং আজ দেখার চেষ্টা করবে। দয়া করে এখনই ${phone} নম্বরে কল করুন।`,
  zh: (clinic, phone) => `牙痛很难受，对不起。${clinic}有急诊号，会尽量安排今天看诊。请马上打 ${phone}。`,
  ar: (clinic, phone) => `نأسف على الألم. يحتفظ ${clinic} بمواعيد طارئة وسنحاول رؤيتك اليوم. اتصل الآن على ${phone}.`,
  es: (clinic, phone) =>
    `Lamentamos el dolor. ${clinic} guarda citas de urgencia e intentará verle hoy. Llame ahora al ${phone}.`,
};

const ACHE_GROUP: Record<string, string> = {
  en: "All three clinics keep same-day emergency appointments. Please call now:",
  ml: "മൂന്ന് ക്ലിനിക്കുകളിലും ഇന്നുതന്നെ അടിയന്തര സമയം ഉണ്ട്. ദയവായി ഇപ്പോൾ വിളിക്കൂ:",
  ta: "மூன்று கிளினிக்குகளிலும் இன்றே அவசர நேரம் உண்டு. தயவுசெய்து இப்போது அழைக்கவும்:",
  hi: "तीनों क्लिनिक में आज का इमरजेंसी अपॉइंटमेंट रहता है। कृपया अभी कॉल करें:",
  bn: "তিনটি ক্লিনিকেই আজকের জরুরি অ্যাপয়েন্টমেন্ট থাকে। দয়া করে এখনই কল করুন:",
  zh: "三家诊所都有当天的急诊号。请马上打：",
  ar: "العيادات الثلاث تبقي مواعيد طوارئ في نفس اليوم. اتصل الآن:",
  es: "Las tres clínicas tienen citas de urgencia para el mismo día. Llame ahora:",
};

const WHITE_ALL: Record<string, string> = {
  en: "Yes, all three clinics offer teeth whitening. At Woonona Dentists, in-chair Philips Zoom whitening is $650 and takes about an hour; Shellharbour Dentists also offers in-chair Philips Zoom; at Dapto Dentists we check your teeth and existing work first.",
  ml: "അതെ, മൂന്ന് ക്ലിനിക്കുകളിലും പല്ല് വെളുപ്പിക്കൽ ഉണ്ട്. Woonona Dentists-ൽ കസേരയിലെ Philips Zoom പല്ല് വെളുപ്പിക്കൽ $650 ആണ്, ഏകദേശം ഒരു മണിക്കൂർ എടുക്കും. Shellharbour Dentists-ലും കസേരയിൽ Philips Zoom ഉണ്ട്. Dapto Dentists-ൽ ആദ്യം പല്ലും നിലവിലുള്ള ചികിത്സയും നോക്കും.",
  ta: "ஆம், மூன்று கிளினிக்குகளிலும் பல் வெண்மையாக்குதல் உண்டு. Woonona Dentists-இல் நாற்காலியில் Philips Zoom பல் வெண்மையாக்குதல் $650, சுமார் ஒரு மணி நேரம். Shellharbour Dentists-இலும் நாற்காலியில் Philips Zoom உண்டு. Dapto Dentists-இல் முதலில் பற்களையும் ஏற்கனவே உள்ள சிகிச்சையையும் பார்ப்போம்.",
  hi: "हाँ, तीनों क्लिनिक में दांत सफ़ेद करना होता है। Woonona Dentists में कुर्सी पर Philips Zoom से दांत सफ़ेद करना $650 है और करीब एक घंटा लगता है। Shellharbour Dentists में भी कुर्सी पर Philips Zoom होता है। Dapto Dentists में पहले दाँत और मौजूदा इलाज देख लेते हैं।",
  bn: "হ্যাঁ, তিনটি ক্লিনিকেই দাঁত সাদা করা হয়। Woonona Dentists-এ চেয়ারে Philips Zoom দিয়ে দাঁত সাদা করা $650 এবং প্রায় এক ঘণ্টা। Shellharbour Dentists-এও চেয়ারে Philips Zoom আছে। Dapto Dentists-এ আগে দাঁত ও আগের চিকিৎসা দেখে নিই।",
  zh: "有的，三家诊所都做牙齿美白。Woonona Dentists 诊椅上的 Philips Zoom 美白是 $650，大约一小时。Shellharbour Dentists 也有诊椅上的 Philips Zoom。Dapto Dentists 会先检查牙齿和现有治疗。",
  ar: "نعم، العيادات الثلاث تقدم تبييض الأسنان. في Woonona Dentists تبييض Philips Zoom على الكرسي بـ $650 ويستغرق نحو ساعة. Shellharbour Dentists يقدم أيضًا Philips Zoom على الكرسي. في Dapto Dentists نفحص الأسنان والعلاج الموجود أولًا.",
  es: "Sí, las tres clínicas ofrecen blanqueamiento dental. En Woonona Dentists, el blanqueamiento en el sillón con Philips Zoom cuesta $650 y dura cerca de una hora. Shellharbour Dentists también ofrece Philips Zoom en el sillón. En Dapto Dentists revisamos primero los dientes y el tratamiento que ya tiene.",
};

const WHITE_ONE: Record<string, Record<ClinicId, string>> = {
  en: {
    dapto: "Yes. At Dapto Dentists we check your teeth and existing work first, then do the whitening.",
    shellharbour: "Yes. Shellharbour Dentists offers in-chair Philips Zoom whitening, and it takes about an hour.",
    woonona: "Yes. At Woonona Dentists, in-chair Philips Zoom whitening is $650 and takes about an hour.",
  },
  ml: {
    dapto: "അതെ. Dapto Dentists-ൽ ആദ്യം പല്ലും നിലവിലുള്ള ചികിത്സയും നോക്കി പല്ല് വെളുപ്പിക്കൽ ചെയ്യും.",
    shellharbour: "അതെ. Shellharbour Dentists-ൽ കസേരയിൽ Philips Zoom പല്ല് വെളുപ്പിക്കൽ ഉണ്ട്. ഏകദേശം ഒരു മണിക്കൂർ എടുക്കും.",
    woonona: "അതെ. Woonona Dentists-ൽ കസേരയിലെ Philips Zoom പല്ല് വെളുപ്പിക്കൽ $650 ആണ്, ഏകദേശം ഒരു മണിക്കൂർ എടുക്കും.",
  },
  ta: {
    dapto: "ஆம். Dapto Dentists-இல் முதலில் பற்களையும் ஏற்கனவே உள்ள சிகிச்சையையும் பார்த்து பல் வெண்மையாக்குதல் செய்வோம்.",
    shellharbour: "ஆம். Shellharbour Dentists-இல் நாற்காலியில் Philips Zoom பல் வெண்மையாக்குதல் உண்டு. சுமார் ஒரு மணி நேரம் ஆகும்.",
    woonona: "ஆம். Woonona Dentists-இல் நாற்காலியில் Philips Zoom பல் வெண்மையாக்குதல் $650, சுமார் ஒரு மணி நேரம்.",
  },
  hi: {
    dapto: "हाँ। Dapto Dentists में पहले दाँत और मौजूदा इलाज देखकर दांत सफ़ेद करना करते हैं।",
    shellharbour: "हाँ। Shellharbour Dentists में कुर्सी पर Philips Zoom से दांत सफ़ेद करना होता है, करीब एक घंटा लगता है।",
    woonona: "हाँ। Woonona Dentists में कुर्सी पर Philips Zoom से दांत सफ़ेद करना $650 है और करीब एक घंटा लगता है।",
  },
  bn: {
    dapto: "হ্যাঁ। Dapto Dentists-এ আগে দাঁত ও আগের চিকিৎসা দেখে দাঁত সাদা করা হয়।",
    shellharbour: "হ্যাঁ। Shellharbour Dentists-এ চেয়ারে Philips Zoom দিয়ে দাঁত সাদা করা হয়, প্রায় এক ঘণ্টা লাগে।",
    woonona: "হ্যাঁ। Woonona Dentists-এ চেয়ারে Philips Zoom দিয়ে দাঁত সাদা করা $650 এবং প্রায় এক ঘণ্টা।",
  },
  zh: {
    dapto: "有的。Dapto Dentists 会先检查牙齿和现有治疗，再做牙齿美白。",
    shellharbour: "有的。Shellharbour Dentists 有诊椅上的 Philips Zoom 牙齿美白，大约一小时。",
    woonona: "有的。Woonona Dentists 诊椅上的 Philips Zoom 牙齿美白是 $650，大约一小时。",
  },
  ar: {
    dapto: "نعم. في Dapto Dentists نفحص الأسنان والعلاج الموجود أولًا، ثم نقوم بتبييض الأسنان.",
    shellharbour: "نعم. يقدم Shellharbour Dentists تبييض Philips Zoom على الكرسي، ويستغرق نحو ساعة.",
    woonona: "نعم. في Woonona Dentists تبييض Philips Zoom على الكرسي بـ $650 ويستغرق نحو ساعة.",
  },
  es: {
    dapto: "Sí. En Dapto Dentists revisamos primero los dientes y el tratamiento que ya tiene, y después hacemos el blanqueamiento.",
    shellharbour: "Sí. Shellharbour Dentists ofrece blanqueamiento en el sillón con Philips Zoom, y dura cerca de una hora.",
    woonona: "Sí. En Woonona Dentists, el blanqueamiento en el sillón con Philips Zoom cuesta $650 y dura cerca de una hora.",
  },
};

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

function phones(index: KnowledgeIndex, ids: ClinicId[]): string {
  return ids
    .map((id) => {
      const card = index.contacts[id];
      return card ? `${card.name} ${card.phone}` : "";
    })
    .filter(Boolean)
    .join("\n");
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
  const line = phones(index, ids);
  if (ids.length === 1) {
    const card = index.contacts[ids[0]];
    const write = ACHE_ONE[code] ?? ACHE_ONE.en;
    return write?.(card?.name ?? "", card?.phone ?? "") ?? "";
  }
  const lead = ACHE_GROUP[code] ?? ACHE_GROUP.en ?? "";
  return `${lead}\n${line}`;
}

export function whiteningReply(code: string, focus: ClinicFocus, index: KnowledgeIndex): string {
  const ids = idsFor(focus);
  const one = WHITE_ONE[code] ?? WHITE_ONE.en;
  const body =
    focus.kind === "any" || ids.length >= 3
      ? (WHITE_ALL[code] ?? WHITE_ALL.en ?? "")
      : ids.map((id) => one?.[id] ?? "").filter(Boolean).join("\n");
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
