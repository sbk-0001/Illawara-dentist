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
  en: "Sorry about the pain. All three clinics keep emergency appointments and will try to see you today. Please call now.",
  ml: "വേദനയിൽ ഖേദിക്കുന്നു. മൂന്ന് ക്ലിനിക്കുകളും അടിയന്തര സമയം വെച്ചിട്ടുണ്ട്, ഇന്ന് കാണാൻ ശ്രമിക്കാം. ദയവായി ഇപ്പോൾ വിളിക്കൂ.",
  ta: "வலிக்கு வருந்துகிறோம். மூன்று கிளினிக்குகளும் அவசர நேரம் வைத்திருக்கின்றன, இன்று பார்க்க முயற்சிப்போம். தயவுசெய்து இப்போது அழைக்கவும்.",
  hi: "दर्द के लिए खेद है। तीनों क्लिनिक इमरजेंसी अपॉइंटमेंट रखते हैं और आज देखने की कोशिश करेंगे। कृपया अभी कॉल करें।",
  bn: "ব্যথার জন্য দুঃখিত। তিনটি ক্লিনিকই জরুরি অ্যাপয়েন্টমেন্ট রাখে এবং আজ দেখার চেষ্টা করবে। দয়া করে এখনই কল করুন।",
  zh: "牙痛很难受，对不起。三家诊所都有急诊号，会尽量安排今天看诊。请马上打电话。",
  ar: "نأسف على الألم. العيادات الثلاث لديها مواعيد طارئة وسنحاول رؤيتك اليوم. اتصل الآن.",
  es: "Lamentamos el dolor. Las tres clínicas guardan citas de urgencia e intentarán verle hoy. Llame ahora.",
};

const WHITE_YES: Record<string, string> = {
  en: "Yes, we offer teeth whitening.",
  ml: "അതെ, ഞങ്ങൾ പല്ല് വെളുപ്പിക്കൽ ചെയ്യുന്നു.",
  ta: "ஆம், நாங்கள் பல் வெண்மையாக்குதல் செய்கிறோம்.",
  hi: "हाँ, हम दांत सफ़ेद करना करते हैं।",
  bn: "হ্যাঁ, আমরা দাঁত সাদা করা করি।",
  zh: "有的，我们做牙齿美白。",
  ar: "نعم، نقدم تبييض الأسنان.",
  es: "Sí, ofrecemos blanqueamiento dental.",
};

const WHITE_DETAIL: Record<string, Record<ClinicId | "all", string>> = {
  en: {
    dapto: "It is done after a check of your teeth and any existing dental work.",
    shellharbour: "In-chair whitening with Philips Zoom takes about an hour, after the dentist checks that it suits your teeth.",
    woonona: "Chair-side Philips Zoom takes about an hour and the page lists it at $650.",
    all: "It is done after a check of your teeth.",
  },
  ml: {
    dapto: "പല്ലുകളും നിലവിലുള്ള ചികിത്സയും നോക്കിയ ശേഷമാണ്.",
    shellharbour: "കസേരയിൽ Philips Zoom കൊണ്ട് ഏകദേശം ഒരു മണിക്കൂർ എടുക്കും. പല്ലിന് ചേരുമോ എന്ന് ഡോക്ടർ നോക്കും.",
    woonona: "കസേരയിൽ Philips Zoom ഏകദേശം ഒരു മണിക്കൂർ എടുക്കും. പേജിൽ $650 എന്ന് കാണുന്നു.",
    all: "പല്ലുകൾ നോക്കിയ ശേഷമാണ് ചെയ്യുന്നത്.",
  },
  ta: {
    dapto: "பற்களையும் ஏற்கனவே உள்ள சிகிச்சையையும் பார்த்த பிறகுதான்.",
    shellharbour: "நாற்காலியில் Philips Zoom சுமார் ஒரு மணி நேரம். பல்லுக்கு ஏறுமா என்று பல் மருத்துவர் பார்ப்பார்.",
    woonona: "நாற்காலியில் Philips Zoom சுமார் ஒரு மணி நேரம். பக்கத்தில் $650 என்று உள்ளது.",
    all: "பற்களைப் பார்த்த பிறகுதான் செய்கிறோம்.",
  },
  hi: {
    dapto: "दांतों और मौजूदा इलाज को देखने के बाद किया जाता है।",
    shellharbour: "कुर्सी पर Philips Zoom करीब एक घंटे का है। दांत के लिए सही है या नहीं, दंत चिकित्सक देखता है।",
    woonona: "कुर्सी पर Philips Zoom करीब एक घंटे का है। पेज पर $650 लिखा है।",
    all: "दांतों की जाँच के बाद किया जाता है।",
  },
  bn: {
    dapto: "দাঁত ও আগের চিকিৎসা দেখে তারপর করা হয়।",
    shellharbour: "চেয়ারে Philips Zoom প্রায় এক ঘণ্টা। দাঁতের জন্য ঠিক কিনা ডেন্টিস্ট দেখেন।",
    woonona: "চেয়ারে Philips Zoom প্রায় এক ঘণ্টা। পেজে $650 লেখা আছে।",
    all: "দাঁত দেখে তারপর করা হয়।",
  },
  zh: {
    dapto: "会先检查牙齿和现有治疗，再做美白。",
    shellharbour: "诊椅上的 Philips Zoom 大约一小时，牙医会先看是否适合你的牙齿。",
    woonona: "诊椅上的 Philips Zoom 大约一小时，页面写的是 $650。",
    all: "会先检查牙齿再做。",
  },
  ar: {
    dapto: "يُجرى بعد فحص الأسنان وأي علاج موجود.",
    shellharbour: "التبييض على الكرسي بـ Philips Zoom يستغرق نحو ساعة، بعد أن يتحقق الطبيب من ملاءمته.",
    woonona: "Philips Zoom على الكرسي يستغرق نحو ساعة، والصفحة تذكر $650.",
    all: "يُجرى بعد فحص الأسنان.",
  },
  es: {
    dapto: "Se hace después de revisar los dientes y el tratamiento que ya tiene.",
    shellharbour: "El blanqueamiento en el sillón con Philips Zoom dura cerca de una hora, después de comprobar que conviene.",
    woonona: "Philips Zoom en el sillón dura cerca de una hora y la página indica $650.",
    all: "Se hace después de revisar los dientes.",
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
    .join(" · ");
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
  const yes = WHITE_YES[code] ?? WHITE_YES.en ?? "";
  const details = WHITE_DETAIL[code] ?? WHITE_DETAIL.en;
  const detail = ids.length === 1 ? details?.[ids[0]] : details?.all;
  return `${yes} ${detail ?? ""}\n${bookings(index, ids)}`.trim();
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
