import { mentionedClinics, type ClinicFocus } from "../intent";
import { clinicName } from "../retrieval/search";
import type { ClinicId } from "../types";

/**
 * Opening hours taken only from indexed pages. Times are 24-hour. Sunday is not
 * stated on the pages below, so it is not filled in.
 *
 * Dapto — https://daptodentists.com.au/ (chunk dapto-home-0):
 * "open Monday to Friday from 8:00 AM to 6:00 PM and Saturday from 8:00 AM to 4:00 PM."
 * The contact card's visible header agrees: "Mon–Fri 8am–6pm Saturday 8am–4pm".
 *
 * Shellharbour — contact-card header (visible text on priority pages /, contact, our-fees, about):
 * "Monday – Friday 8.00 AM – 5.00 PM Saturday Appointment only".
 * Body copy agrees, for example https://shellharbourdentist.com.au/dentist-shell-cove/ :
 * "Monday to Friday, 8:00 AM to 5:00 PM, with Saturday appointments available by prior arrangement."
 * The same sentence is repeated on the suburb pages. https://shellharbourdentist.com.au/new-patient-offer/
 * prints the same Monday–Friday 8:00 am–5:00 pm and Saturday by appointment, but a different phone
 * (02 4214 4372). Clock times match, so that phone is not used. JSON-LD Mon–Sun 09:00–17:00 is not
 * in the index; the crawler keeps the visible header.
 *
 * Woonona — https://woononadentists.com.au/ (heading Clinic Hours):
 * "Mon – Fri : 8:00 AM – 6:00 PM Saturday : 8:00 AM – 5:00 PM After hours treatment available everyday with prior appointment."
 * https://woononadentists.com.au/contact-us/ agrees:
 * "Mon – Fri: 8am – 6 pm Saturday: 8am – 5 pm Emergency bookings available outside the above by appointment."
 * The contact-card header agrees: "Monday – Friday 8.00 AM – 6.00 PM Saturday 8 AM – 5 PM".
 * DISAGREE: https://woononadentists.com.au/new-patient-offer/ says
 * "Monday - Friday 8:00 am – 5:00 pm Saturday By Appointment" and phone 02 4214 4469.
 * Homepage and contact page are the schedule used here.
 */

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Span = { days: Day[]; open: string; close: string };

type Note = { kind: "appointment"; days: Day[] } | { kind: "after-hours" };

type Schedule = {
  spans: Span[];
  notes: Note[];
  sources: string[];
  /** English caution for the model. Not part of the quoted hours line. */
  disagreement?: string;
};

const DAY_ORDER: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const CLINIC_HOURS: Record<ClinicId, Schedule> = {
  dapto: {
    spans: [
      { days: ["mon", "tue", "wed", "thu", "fri"], open: "08:00", close: "18:00" },
      { days: ["sat"], open: "08:00", close: "16:00" },
    ],
    notes: [],
    sources: ["https://daptodentists.com.au/"],
  },
  shellharbour: {
    spans: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "08:00", close: "17:00" }],
    notes: [{ kind: "appointment", days: ["sat"] }],
    sources: ["https://shellharbourdentist.com.au/dentist-shell-cove/"],
  },
  woonona: {
    spans: [
      { days: ["mon", "tue", "wed", "thu", "fri"], open: "08:00", close: "18:00" },
      { days: ["sat"], open: "08:00", close: "17:00" },
    ],
    notes: [{ kind: "after-hours" }],
    sources: ["https://woononadentists.com.au/", "https://woononadentists.com.au/contact-us/"],
    disagreement:
      "https://woononadentists.com.au/new-patient-offer/ states a 17:00 weekday close and appointment-only Saturday, plus phone 02 4214 4469. That disagrees with the homepage and contact page. Quote only the line above.",
  },
};

const DAY_NAMES: Record<string, string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  bn: ["সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার", "রবিবার"],
  "bn-Latn": ["Shombar", "Mongolbar", "Budhbar", "Brihoshpotibar", "Shukrobar", "Shonibar", "Robibar"],
  hi: ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
  "hi-Latn": ["Somvaar", "Mangalvaar", "Budhvaar", "Guruvaar", "Shukravaar", "Shanivaar", "Ravivaar"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
  ur: ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ", "اتوار"],
  fa: ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  es: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
  fr: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  pt: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
  it: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
  de: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  vi: ["thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"],
  ko: ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"],
  el: ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"],
  id: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
  ms: ["Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu", "Ahad"],
  tl: ["Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado", "Linggo"],
  ja: ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"],
  ru: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"],
  tr: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
  ml: ["തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി", "ഞായർ"],
  ta: ["திங்கள்", "செவ்வாய்", "புதன்", "வியாழன்", "வெள்ளி", "சனி", "ஞாயிறு"],
};

const APPOINTMENT: Record<string, string> = {
  en: "by appointment",
  bn: "অ্যাপয়েন্টমেন্টে",
  "bn-Latn": "appointment e",
  hi: "अपॉइंटमेंट पर",
  "hi-Latn": "appointment par",
  ar: "بموعد مسبق",
  ur: "اپائنٹمنٹ پر",
  fa: "با وقت قبلی",
  zh: "需预约",
  es: "con cita",
  fr: "sur rendez-vous",
  pt: "com marcação",
  it: "su appuntamento",
  de: "nach Vereinbarung",
  vi: "theo lịch hẹn",
  ko: "예약제",
  el: "κατόπιν ραντεβού",
  id: "dengan janji",
  ms: "dengan temujanji",
  tl: "sa appointment",
  ja: "要予約",
  ru: "по записи",
  tr: "randevu ile",
  ml: "അപ്പോയിന്റ്മെന്റിൽ",
  ta: "முன்பதிவில்",
};

/** Same fact as the Woonona homepage ("every day with prior appointment") and contact page. */
const AFTER_HOURS: Record<string, string> = {
  en: "After-hours treatment is available every day with a prior appointment",
  bn: "এই সময়ের বাইরেও প্রতিদিন আগের অ্যাপয়েন্টমেন্টে চিকিৎসা পাওয়া যায়",
  "bn-Latn": "Ei somoyer baireo protidin ager appointment e treatment pawa jay",
  hi: "इस समय के बाहर भी हर दिन पहले से अपॉइंटमेंट पर इलाज मिल सकता है",
  "hi-Latn": "Is samay ke bahar bhi har din pehle se appointment par ilaj mil sakta hai",
  ar: "العلاج خارج هذه الساعات متاح كل يوم بموعد مسبق",
  ur: "ان اوقات کے علاوہ بھی ہر روز پہلے سے اپائنٹمنٹ پر علاج دستیاب ہے",
  fa: "درمان خارج از این ساعت‌ها هر روز با وقت قبلی ممکن است",
  zh: "上述时间以外，每天可预约就诊",
  es: "Hay atención fuera de ese horario todos los días con cita previa",
  fr: "En dehors de ces horaires, un rendez-vous est possible chaque jour",
  pt: "Há atendimento fora desse horário todos os dias com marcação prévia",
  it: "Fuori da questi orari è possibile un appuntamento ogni giorno",
  de: "Außerhalb dieser Zeiten ist jeden Tag eine Behandlung nach Vereinbarung möglich",
  vi: "Ngoài các giờ trên, có thể khám mỗi ngày nếu đặt lịch trước",
  ko: "위 시간 외에도 매일 사전 예약으로 진료가 가능합니다",
  el: "Εκτός αυτών των ωρών, θεραπεία είναι διαθέσιμη κάθε μέρα με ραντεβού",
  id: "Di luar jam ini, perawatan tersedia setiap hari dengan janji sebelumnya",
  ms: "Di luar waktu ini, rawatan tersedia setiap hari dengan temujanji terlebih dahulu",
  tl: "Sa labas ng oras na ito, may treatment araw-araw kung may appointment",
  ja: "上記以外の時間も、事前予約で毎日受診できます",
  ru: "Вне этих часов приём возможен каждый день по предварительной записи",
  tr: "Bu saatler dışında her gün önceden randevu ile tedavi mümkündür",
  ml: "ഈ സമയത്തിന് പുറത്തും എല്ലാ ദിവസവും മുൻകൂർ അപ്പോയിന്റ്മെന്റിൽ ചികിത്സ ലഭിക്കും",
  ta: "இந்த நேரத்துக்கு வெளியேயும் ஒவ்வொரு நாளும் முன்பதிவில் சிகிச்சை கிடைக்கும்",
};

const ENGLISH_DAYS =
  "(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)";

const ENGLISH_CLOCK = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)`;

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  friday: 4,
  fri: 4,
  saturday: 5,
  sat: 5,
  sunday: 6,
  sun: 6,
};

const HOURS_QUESTION =
  /opening hours|opening time|business hours|clinic hours|\bhours\b|\bopen\b|\bopens\b|\bopening\b|\bclose[sd]?\b|\bclosing\b|\bsaturday\b|\bsunday\b|\bmonday\b|\bfriday\b|സമയം|തുറക്കും|തുറക്കു|തുറന്ന|തുറ|நேரம்|திறக்கும்|திறக்கு|திற|খোলা|শনি|बजे|खुल|घंट|营业|几点|开门|giờ|mở cửa|ώρα|orari|sabato|horario|horário|sábado|shonibar|khula|khola|baje|thurakkum|thirakkum|ساعات|اوقات|jam buka|horaires|öffnungs|saatleri|영업|진료|営業|営業時間|часы|суббот|pazartesi|saat kaç/i;

const HOURS_CHUNK = /clinic hours|operating hours|opening hours|monday to friday|mon\s*[–—-]\s*fri|8:00\s*am|8\.00\s*am|8am/i;

export function hoursSource(clinic: ClinicId): { sources: string[]; disagreement?: string } {
  const schedule = CLINIC_HOURS[clinic];
  return { sources: schedule.sources, disagreement: schedule.disagreement };
}

export function questionAsksHours(text: string): boolean {
  return HOURS_QUESTION.test(text);
}

export function chunkStatesHours(chunk: { heading?: string; text?: string }): boolean {
  return HOURS_CHUNK.test(`${chunk.heading || ""} ${chunk.text || ""}`);
}

export function hoursRelevant(question: string, chunks: { heading?: string; text?: string }[]): boolean {
  if (questionAsksHours(question)) return true;
  return chunks.some((chunk) => chunkStatesHours(chunk));
}

function known(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(DAY_NAMES, code);
}

function dayNames(code: string): string[] {
  return DAY_NAMES[code] ?? DAY_NAMES.en ?? [];
}

function formatDays(days: Day[], code: string): string {
  const names = dayNames(code);
  const indexes = days.map((day) => DAY_ORDER.indexOf(day)).filter((index) => index >= 0);
  const first = names[indexes[0] ?? 0] ?? "";
  if (indexes.length <= 1) return first;
  const last = names[indexes[indexes.length - 1] ?? 0] ?? "";
  const join = code === "fa" || code === "ur" ? " تا " : code === "zh" ? "至" : "–";
  return `${first}${join}${last}`;
}

function parts(hhmm: string): { hour: number; minute: string } {
  const [hour, minute] = hhmm.split(":");
  return { hour: Number(hour), minute: minute || "00" };
}

function hour12(hour: number): number {
  const next = hour % 12;
  return next === 0 ? 12 : next;
}

/** One clock time in the reply language. Western digits. Unknown languages use 24-hour. */
export function formatClock(hhmm: string, code: string): string {
  const { hour, minute } = parts(hhmm);
  const h12 = hour12(hour);
  const h24 = known(code) ? String(hour) : String(hour).padStart(2, "0");
  switch (code) {
    case "en":
      return `${h12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
    case "fr":
    case "pt":
      return `${hour}h${minute}`;
    case "de":
      return `${hour}:${minute}`;
    case "id":
    case "ms":
      return `${hour}.${minute}`;
    case "tr":
      return `${String(hour).padStart(2, "0")}.${minute}`;
    case "ar":
      return `${h12}:${minute} ${hour >= 12 ? "مساءً" : "صباحاً"}`;
    case "ur":
      return `${h12}:${minute} ${hour >= 12 ? "شام" : "صبح"}`;
    case "hi":
      return `${hour < 12 ? "सुबह" : hour < 17 ? "दोपहर" : "शाम"} ${h12}:${minute}`;
    case "bn":
      return `${hour < 12 ? "সকাল" : hour < 17 ? "বিকেল" : "সন্ধ্যা"} ${h12}:${minute}`;
    case "zh":
      return `${hour < 12 ? "上午" : "下午"}${h12}:${minute}`;
    case "ko":
      return `${hour < 12 ? "오전" : "오후"} ${h12}:${minute}`;
    case "ja":
      return `${hour < 12 ? "午前" : "午後"}${h12}:${minute}`;
    default:
      return `${h24}:${minute}`;
  }
}

const SPOKEN_HOURS = new Set(["ml", "ta", "hi", "bn", "zh", "ar", "es"]);

function spokenClock(hhmm: string, code: string): string {
  const { hour, minute } = parts(hhmm);
  const h = hour12(hour);
  const extra = minute === "00" ? "" : `:${minute}`;
  const evening = hour >= 16;
  const afternoon = hour >= 12 && hour < 16;
  if (code === "ml") {
    const part = hour < 12 ? "രാവിലെ" : evening ? "വൈകുന്നേരം" : "ഉച്ചയ്ക്ക്";
    return `${part} ${h}${extra} മണി`;
  }
  if (code === "ta") {
    const part = hour < 12 ? "காலை" : evening ? "மாலை" : "மதியம்";
    return `${part} ${h}${extra} மணி`;
  }
  if (code === "hi") {
    const part = hour < 12 ? "सुबह" : afternoon ? "दोपहर" : "शाम";
    return `${part} ${h}${extra} बजे`;
  }
  if (code === "bn") {
    const part = hour < 12 ? "সকাল" : "বিকাল";
    return `${part} ${h}${extra}টা`;
  }
  if (code === "zh") return `${hour < 12 ? "上午" : "下午"}${h}${extra}点`;
  if (code === "ar") return `${h}${extra} ${hour < 12 ? "صباحًا" : "مساءً"}`;
  if (code === "es") return `${h}${extra} de la ${hour < 12 ? "mañana" : "tarde"}`;
  return formatClock(hhmm, code);
}

function spokenSpan(open: string, close: string, code: string): string {
  const start = spokenClock(open, code);
  const end = spokenClock(close, code);
  if (code === "ml") return `${start} മുതൽ ${end} വരെ`;
  if (code === "ta") return `${start} முதல் ${end} வரை`;
  if (code === "hi") return `${start} से ${end} तक`;
  if (code === "bn") return `${start} থেকে ${end} পর্যন্ত`;
  if (code === "zh") return `${start}到${end}`;
  if (code === "ar") return `من ${start} إلى ${end}`;
  if (code === "es") return `de ${start} a ${end}`;
  return `${start}–${end}`;
}

const FULL_DAY: Record<string, Partial<Record<Day, string>>> = {
  en: { sat: "Saturday", sun: "Sunday", mon: "Monday", fri: "Friday" },
  ml: { sat: "ശനിയാഴ്ച", sun: "ഞായറാഴ്ച", mon: "തിങ്കളാഴ്ച", fri: "വെള്ളിയാഴ്ച" },
  ta: { sat: "சனிக்கிழமை", sun: "ஞாயிற்றுக்கிழமை", mon: "திங்கட்கிழமை", fri: "வெள்ளிக்கிழமை" },
  hi: { sat: "शनिवार", sun: "रविवार", mon: "सोमवार", fri: "शुक्रवार" },
  bn: { sat: "শনিবার", sun: "রবিবার", mon: "সোমবার", fri: "শুক্রবার" },
  zh: { sat: "周六", sun: "周日", mon: "周一", fri: "周五" },
  ar: { sat: "السبت", sun: "الأحد", mon: "الاثنين", fri: "الجمعة" },
  es: { sat: "sábado", sun: "domingo", mon: "lunes", fri: "viernes" },
};

const DAY_ASK: { day: Day; re: RegExp }[] = [
  { day: "sat", re: /saturday|ശനി|சனி|शनि|শনি|周六|星期六|sábado|السبت/i },
  { day: "sun", re: /sunday|ഞായ|ஞாயி|रवि|রবি|周日|星期日|domingo|الأحد/i },
  { day: "mon", re: /monday|തിങ്ക|திங்|सोम|সোম|周一|星期一|lunes|الاثنين/i },
  { day: "fri", re: /friday|വെള്ളി|வெள்ளி|शुक्र|শুক্র|周五|星期五|viernes|الجمعة/i },
];

function askedDay(question: string): Day | null {
  const hits = DAY_ASK.filter((item) => item.re.test(question));
  return hits.length === 1 ? hits[0].day : null;
}

function weekdayLabel(code: string): string {
  if (code === "en") return "Monday to Friday";
  if (code === "ml") return "തിങ്കളാഴ്ച മുതൽ വെള്ളിയാഴ്ച വരെ";
  if (code === "ta") return "திங்கள் முதல் வெள்ளி வரை";
  if (code === "hi") return "सोमवार से शुक्रवार तक";
  if (code === "bn") return "সোমবার থেকে শুক্রবার";
  if (code === "zh") return "周一至周五";
  if (code === "ar") return "من الاثنين إلى الجمعة";
  if (code === "es") return "de lunes a viernes";
  return formatDays(["mon", "tue", "wed", "thu", "fri"], code);
}

function dayLabel(code: string, day: Day): string {
  return FULL_DAY[code]?.[day] || formatDays([day], code);
}

function formatSpan(open: string, close: string, code: string): string {
  if (SPOKEN_HOURS.has(code)) return spokenSpan(open, close, code);
  if (code === "fa") return `${formatClock(open, "fa")} تا ${formatClock(close, "fa")}`;
  if (code === "de") return `${formatClock(open, code)}–${formatClock(close, code)} Uhr`;
  return `${formatClock(open, code)}–${formatClock(close, code)}`;
}

export function formatClinicHours(clinic: ClinicId, code: string): string {
  const schedule = CLINIC_HOURS[clinic];
  const comma = code === "ar" || code === "fa" || code === "ur" ? "، " : ", ";
  const partsLine = [
    ...schedule.spans.map((span) => `${formatDays(span.days, code)} ${formatSpan(span.open, span.close, code)}`),
    ...schedule.notes
      .filter((note): note is { kind: "appointment"; days: Day[] } => note.kind === "appointment")
      .map((note) => `${formatDays(note.days, code)} ${APPOINTMENT[code] ?? APPOINTMENT.en}`),
  ];
  const line = partsLine.join(comma);
  const after = schedule.notes.some((note) => note.kind === "after-hours") ? (AFTER_HOURS[code] ?? AFTER_HOURS.en) : "";
  return after ? `${line}. ${after}` : line;
}

const BARE_HOURS_MAX = 400;

function stripHoursQuotes(text: string): string {
  return text.replace(/["“”«»„]/g, "");
}

function normalizeHoursLine(text: string): string {
  return stripHoursQuotes(text)
    .trim()
    .replace(/[.。]+$/u, "")
    .replace(/：/g, ":")
    .replace(/([^\d\s]):\s*/g, "$1: ")
    .replace(/\s+/g, " ")
    .trim();
}

const HOURS_LEAD: Record<string, (name: string) => string> = {
  en: (name) => (name ? `${name} is open:` : "Here are the opening hours."),
  bn: (name) => (name ? `${name} খোলা থাকে:` : "খোলার সময় নিচে দেওয়া হলো।"),
  "bn-Latn": (name) => (name ? `${name} khola thake:` : "Kholar somoy niche dewa holo."),
  hi: (name) => (name ? `${name} खुला रहता है:` : "खुलने का समय यह है।"),
  "hi-Latn": (name) => (name ? `${name} khula rehta hai:` : "Khulne ka samay yeh hai."),
  zh: (name) => (name ? `${name}的营业时间如下：` : "营业时间如下。"),
  ja: (name) => (name ? `${name}の診療時間は次のとおりです：` : "診療時間は次のとおりです。"),
  ko: (name) => (name ? `${name}의 진료 시간은 다음과 같습니다:` : "진료 시간은 다음과 같습니다."),
  es: (name) => (name ? `${name} abre:` : "El horario de apertura es el siguiente."),
  vi: (name) => (name ? `${name} mở cửa:` : "Giờ mở cửa như sau."),
  ar: (name) => (name ? `ساعات عمل ${name}:` : "ساعات العمل كالتالي."),
  ur: (name) => (name ? `${name} کے اوقات:` : "اوقات یہ ہیں۔"),
  fa: (name) => (name ? `ساعات کاری ${name}:` : "ساعات کاری این است."),
  he: (name) => (name ? `שעות הפתיחה של ${name}:` : "שעות הפתיחה הן אלה."),
  el: (name) => (name ? `Το ${name} είναι ανοιχτό:` : "Το ωράριο λειτουργίας είναι το εξής."),
  fr: (name) => (name ? `${name} est ouvert :` : "Voici les horaires d'ouverture."),
  de: (name) => (name ? `${name} ist geöffnet:` : "Das sind die Öffnungszeiten."),
  pt: (name) => (name ? `${name} funciona:` : "Estes são os horários de funcionamento."),
  it: (name) => (name ? `${name} è aperto:` : "Questi sono gli orari di apertura."),
  id: (name) => (name ? `${name} buka:` : "Jam buka adalah sebagai berikut."),
  ms: (name) => (name ? `${name} dibuka:` : "Waktu operasi adalah seperti berikut."),
  ru: (name) => (name ? `${name} открыта:` : "Часы работы такие."),
  th: (name) => (name ? `${name} เปิด:` : "เวลาเปิดมีดังนี้"),
  ne: (name) => (name ? `${name} खुल्छ:` : "खुल्ने समय यस्तो छ।"),
  pa: (name) => (name ? `${name} ਖੁੱਲ੍ਹਾ ਹੈ:` : "ਖੁੱਲ੍ਹਣ ਦੇ ਸਮੇਂ ਇਹ ਹਨ।"),
  ta: (name) => (name ? `${name} திறந்துள்ளது:` : "திறந்திருக்கும் நேரம் இது."),
  te: (name) => (name ? `${name} తెరిచి ఉంది:` : "తెరిచే సమయం ఇది."),
  ml: (name) => (name ? `${name} തുറന്നിരിക്കുന്നു:` : "പ്രവർത്തന സമയം ഇതാണ്."),
};

function hoursLeadIn(code: string, name: string): string {
  const write = HOURS_LEAD[code] ?? HOURS_LEAD.en;
  return write(name);
}

function hoursShapes(code: string): { clinic: ClinicId; text: string }[] {
  return (["dapto", "shellharbour", "woonona"] as const).flatMap((id) => {
    const hours = normalizeHoursLine(formatClinicHours(id, code));
    const name = clinicName(id);
    return [
      { clinic: id, text: hours },
      { clinic: id, text: normalizeHoursLine(`${name}: ${hours}`) },
    ];
  });
}

/** Every line is only a known hours line, with or without the clinic name. */
export function hoursOnlyClinics(text: string, code: string): ClinicId[] | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > BARE_HOURS_MAX) return null;
  const lines = trimmed.split(/\n/).map((line) => normalizeHoursLine(line)).filter(Boolean);
  if (!lines.length || lines.length > 4) return null;
  const shapes = hoursShapes(code);
  const found: ClinicId[] = [];
  for (const line of lines) {
    const hit = shapes.find((shape) => shape.text === line);
    if (!hit) return null;
    found.push(hit.clinic);
  }
  return found;
}

/** The reply is exactly one clinic's hours line and does not already name a clinic. */
export function bareHoursClinic(text: string, code: string): ClinicId | null {
  const trimmed = normalizeHoursLine(text);
  if (!trimmed || mentionedClinics(text).length > 0) return null;
  const hits = (["dapto", "shellharbour", "woonona"] as const).filter((id) => normalizeHoursLine(formatClinicHours(id, code)) === trimmed);
  return hits.length === 1 ? hits[0] : null;
}

/** True while the text so far is still only a known hours line, so a lead-in can be added at the end. */
export function mayBeBareHours(text: string, code: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > BARE_HOURS_MAX) return false;
  const probe = normalizeHoursLine(trimmed);
  if (!probe) return false;
  return hoursShapes(code).some((shape) => shape.text === probe || shape.text.startsWith(probe));
}

function spokenHoursSentence(code: string, id: ClinicId, day: Day | null): string {
  const name = clinicName(id);
  const schedule = CLINIC_HOURS[id];
  const spans = day ? schedule.spans.filter((span) => span.days.includes(day)) : schedule.spans;
  const appointment = schedule.notes.find((note) => note.kind === "appointment" && (!day || note.days.includes(day)));
  const sentences: string[] = [];
  for (const span of spans) {
    const label = span.days.length > 1 && !day ? weekdayLabel(code) : dayLabel(code, day && span.days.includes(day) ? day : span.days[0]);
    const range = spokenSpan(span.open, span.close, code);
    if (code === "ml") sentences.push(`${name} ${label} ${range} തുറന്നിരിക്കും.`);
    else if (code === "ta") sentences.push(`${name} ${label} ${range} திறந்திருக்கும்.`);
    else if (code === "hi") sentences.push(`${name} ${label} ${range} खुला रहता है।`);
    else if (code === "bn") sentences.push(`${name} ${label} ${range} খোলা থাকে।`);
    else if (code === "zh") sentences.push(`${name}${label}${range}营业。`);
    else if (code === "ar") sentences.push(`يفتح ${name} ${label} ${range}.`);
    else     if (code === "es") sentences.push(`${name} abre ${label} ${range}.`);
  }
  if (!sentences.length && appointment) {
    const label = dayLabel(code, day || "sat");
    if (code === "ml") return `${name} ${label} അപ്പോയിന്റ്മെന്റിൽ മാത്രമേ തുറക്കൂ.`;
    if (code === "ta") return `${name} ${label} முன்பதிவில் மட்டுமே திறக்கும்.`;
    if (code === "hi") return `${name} ${label} को अपॉइंटमेंट पर खुलता है।`;
    if (code === "bn") return `${name} ${label} অ্যাপয়েন্টমেন্টে খোলে।`;
    if (code === "zh") return `${name}${label}需预约。`;
    if (code === "ar") return `${name} يوم ${label} بموعد مسبق.`;
    if (code === "es") return `${name} abre el ${label} con cita.`;
  }
  return sentences.join(" ");
}

function englishClock(hhmm: string): string {
  const { hour, minute } = parts(hhmm);
  const suffix = hour < 12 ? "am" : "pm";
  const extra = minute === "00" ? "" : `:${minute}`;
  return `${hour12(hour)}${extra}${suffix}`;
}

function englishSpokenSpan(open: string, close: string): string {
  return `from ${englishClock(open)} to ${englishClock(close)}`;
}

function hoursSentence(code: string, id: ClinicId, question = ""): string {
  if (code === "en") {
    const day = askedDay(question);
    const name = clinicName(id);
    const schedule = CLINIC_HOURS[id];
    const spans = day ? schedule.spans.filter((span) => span.days.includes(day)) : schedule.spans;
    const open = spans.map((span) => {
      const label = span.days.length > 1 && !day ? "Monday to Friday" : dayLabel("en", day && span.days.includes(day) ? day : span.days[0]);
      return `${name} is open ${label} ${englishSpokenSpan(span.open, span.close)}.`;
    });
    const appointments = schedule.notes
      .filter((note): note is { kind: "appointment"; days: Day[] } => note.kind === "appointment" && (!day || note.days.includes(day)))
      .map((note) => `${name} is open ${dayLabel("en", day || note.days[0] || "sat")} by appointment.`);
    return [...open, ...appointments].join(" ");
  }
  if (SPOKEN_HOURS.has(code)) return spokenHoursSentence(code, id, askedDay(question));
  const hours = formatClinicHours(id, code).replace(/[.。]+$/u, "").trim();
  return `${hoursLeadIn(code, clinicName(id))} ${hours}.`;
}

/** One natural sentence per clinic. Not a `Clinic:` label, and the hours are not quoted. */
function renderHours(code: string, ids: ClinicId[], question = ""): string {
  const lines = ids.map((id) => hoursSentence(code, id, question));
  if (ids.length === 1) return lines[0] ?? "";
  return `${hoursLeadIn(code, "")}\n${lines.join("\n")}`;
}

function splitFirstSentence(text: string): { first: string; rest: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^([\s\S]*?[.!?।。？！])(?!\d)([\s\S]*)$/);
  if (!match) {
    const lineEnd = trimmed.indexOf("\n");
    if (lineEnd < 0) return { first: trimmed, rest: "" };
    return { first: trimmed.slice(0, lineEnd).trim(), rest: trimmed.slice(lineEnd + 1).trim() };
  }
  return { first: (match[1] ?? "").trim(), rest: (match[2] ?? "").trim() };
}

function hoursIds(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  return clinicIdsForHours(focus);
}

function dropRepeatedHours(rest: string, code: string): string {
  let pending = rest.trim();
  let kept = "";
  while (pending) {
    const { first, rest: more } = splitFirstSentence(pending);
    if (!first) break;
    const hoursLine = bareHoursClinic(first, code) || hoursOnlyClinics(first, code);
    if (!hoursLine) kept = `${kept} ${first}`.trim();
    pending = more.trim();
  }
  return kept;
}

/**
 * Hours are one short sentence per clinic, then the schedule once.
 * A `Clinic:` label or quotation marks around the hours are rewritten.
 * When the question never named a clinic, each clinic gets its own sentence.
 */
/** The English schedule is a sentence, so a copied hours line ends with a full stop. */
export function ensureEnglishHoursStop(text: string): string {
  const schedules = (["dapto", "shellharbour", "woonona"] as const).map((id) => formatClinicHours(id, "en"));
  return text
    .split("\n")
    .map((line) => {
      const end = line.trimEnd();
      if (!schedules.some((schedule) => end.includes(schedule))) return line;
      if (/[.!?।。？！]$/.test(end.trim())) return line;
      return `${end}.`;
    })
    .join("\n");
}

const ROBOTIC_HOURS = /തുറന്നിരിക്കുന്നു|திறந்துள்ளது|营业时间如下|上午\d+:\d+|8:00\s*[–-]\s*16:00/;

const WHICH_DAY: Record<string, string> = {
  en: "Which day do you mean?",
  ml: "ഏത് ദിവസമാണ് അറിയേണ്ടത്?",
  ta: "எந்த நாள் என்று சொல்லுங்களேன்?",
  hi: "कौन सा दिन पूछ रहे हैं?",
  bn: "কোন দিনের কথা বলছেন?",
  zh: "您问的是哪一天？",
  ar: "أي يوم تقصد؟",
  es: "¿Qué día pregunta?",
};

const SUNDAY_ONLY = /sunday|ഞായ|ஞாயி|रविवार|রবিবার|周日|星期日|domingo|الأحد/i;
const OTHER_DAY = /monday|tuesday|wednesday|thursday|friday|saturday|തിങ്ക|ശനി|திங்|சனி|सोम|शनि|সোম|শনি|周一|周六|lunes|sábado|الاثنين|السبت/i;

/** A hours question that never named a day must not be answered as Sunday. */
export function guardUnclearDay(reply: string, question: string, code: string): string {
  if (!questionAsksHours(question) || askedDay(question)) return reply;
  if (!SUNDAY_ONLY.test(reply) || OTHER_DAY.test(reply)) return reply;
  return WHICH_DAY[code] ?? WHICH_DAY.en ?? reply;
}

export function guardBareHoursReply(text: string, code: string, focus: ClinicFocus = { kind: "ask" }, question = ""): string {
  const cleaned = stripHoursQuotes(text).trim();
  const only = hoursOnlyClinics(cleaned, code);
  const finish = (value: string) => (code === "en" ? ensureEnglishHoursStop(value) : value);
  if (only) return finish(renderHours(code, hoursIds(focus), question));
  if (SPOKEN_HOURS.has(code) && cleaned.length > 0 && cleaned.length < 220 && ROBOTIC_HOURS.test(cleaned) && !/മണി|மணி|बजे|টা|点|صباح|mañana/.test(cleaned)) {
    return finish(renderHours(code, hoursIds(focus), question));
  }
  if (code === "en" && cleaned.length > 0 && cleaned.length < 240 && /0?\d{1,2}:\d{2}\s*[–-]\s*0?\d{1,2}:\d{2}/.test(cleaned) && !/\b(?:am|pm)\b/i.test(cleaned)) {
    return finish(renderHours(code, hoursIds(focus), question));
  }
  const { first, rest } = splitFirstSentence(cleaned);
  const matched = bareHoursClinic(first, code) || hoursOnlyClinics(first, code)?.[0] || null;
  if (!matched) return finish(text);
  const rendered = renderHours(code, hoursIds(focus), question);
  const remainder = dropRepeatedHours(rest, code);
  return finish(remainder ? `${rendered}\n${remainder}` : rendered);
}

export function clinicIdsForHours(focus: ClinicFocus): ClinicId[] {
  if (focus.kind === "one") return [focus.clinic];
  if (focus.kind === "many") return focus.clinics;
  return ["dapto", "shellharbour", "woonona"];
}

export function localisedHoursBlock(code: string, focus: ClinicFocus, names: (clinic: ClinicId) => string, question = ""): string {
  const spoken = SPOKEN_HOURS.has(code) || code === "en";
  const lines = clinicIdsForHours(focus).flatMap((clinic) => {
    const stored = CLINIC_HOURS[clinic];
    const schedule = formatClinicHours(clinic, code);
    const row = spoken
      ? hoursSentence(code, clinic, question)
      : `${hoursLeadIn(code, names(clinic))} ${schedule}${code === "en" && !/[.!?]$/.test(schedule) ? "." : ""}`;
    return stored.disagreement ? [row, `Do not quote the conflicting page. ${stored.disagreement}`] : [row];
  });
  const instruction = spoken
    ? "Say the sentence below. It already names the clinic and the day the visitor asked about, with morning and evening in the visitor's language. Do not shorten it to a 24-hour range, a colon label, or a second copy of the hours."
    : "When you state opening hours, start with the clinic name in the short sentence below, then quote the matching line below verbatim, including both the opening and the closing time. Do not wrap the hours in quotation marks. Do not write a Clinic: label. Do not repeat the hours. Do not put the clinic name after the hours. Do not answer with only the time the clinic opens. Do not translate it again. Do not use English day names or AM/PM.";
  return ["LOCALISED OPENING HOURS", instruction, ...lines].join("\n");
}

const SKIP_REWRITE = new Set(["en", "bn-Latn", "hi-Latn"]);

/** Replace leftover English day names and AM/PM. Banglish, Hinglish and English are left as written. */
export function rewriteEnglishHours(text: string, code: string): string {
  if (!code || SKIP_REWRITE.has(code)) return text;
  const lead = text.replace(/\b((?:Dapto|Shellharbour|Woonona) Dentists)\s+is open\b/gi, (_all, name: string) => hoursLeadIn(code, name).replace(/:\s*$/u, ""));
  const names = dayNames(code);
  const days = lead.replace(new RegExp(`\\b${ENGLISH_DAYS}\\b`, "gi"), (word) => names[DAY_INDEX[word.toLowerCase()] ?? 0] ?? word);
  return days.replace(new RegExp(`\\b${ENGLISH_CLOCK}\\b`, "gi"), (_all, hour: string, minute: string | undefined, suffix: string) => {
    let h = Number(hour);
    const pm = /^p/i.test(suffix);
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    const hhmm = `${String(h).padStart(2, "0")}:${minute || "00"}`;
    return formatClock(hhmm, code);
  });
}

const NAMED_DAYS: { day: Day; re: RegExp }[] = [
  { day: "mon", re: /\bmonday\b/i },
  { day: "tue", re: /\btuesday\b/i },
  { day: "wed", re: /\bwednesday\b/i },
  { day: "thu", re: /\bthursday\b/i },
  { day: "fri", re: /\bfriday\b/i },
  { day: "sat", re: /\bsaturday\b/i },
  { day: "sun", re: /\bsunday\b/i },
];

function daysMentioned(text: string): Day[] {
  return NAMED_DAYS.filter((item) => item.re.test(text)).map((item) => item.day);
}

function replyHasClock(text: string, hhmm: string, code: string): boolean {
  const formatted = formatClock(hhmm, code);
  if (text.toLowerCase().includes(formatted.toLowerCase())) return true;
  const { hour, minute } = parts(hhmm);
  const h12 = hour12(hour);
  const suffix = hour >= 12 ? "pm" : "am";
  const compact = text.toLowerCase().replace(/\s+/g, "");
  if (compact.includes(`${h12}:${minute}${suffix}`)) return true;
  if (minute === "00" && compact.includes(`${h12}${suffix}`)) return true;
  return compact.includes(hhmm);
}

/**
 * A hours answer that only says when the clinic opens gets the open–close range.
 * "opens at 8:00 AM" on Saturday at Dapto becomes the Saturday 8:00 AM–4:00 PM line.
 */
export function hoursRangeClause(reply: string, question: string, code: string): string {
  const asked = `${question}\n${reply}`;
  if (!questionAsksHours(question) && !questionAsksHours(reply)) return "";
  const clinics = mentionedClinics(asked);
  if (clinics.length !== 1) return "";
  const days = daysMentioned(asked);
  if (days.length !== 1) return "";
  const clinic = clinics[0];
  const day = days[0];
  const schedule = CLINIC_HOURS[clinic];
  const span = schedule.spans.find((item) => item.days.includes(day));
  const dayLabel = formatDays([day], code);
  const name = clinicName(clinic);
  if (!span) {
    const appointment = schedule.notes.some((note) => note.kind === "appointment" && note.days.includes(day));
    if (!appointment) return "";
    const phrase = APPOINTMENT[code] ?? APPOINTMENT.en;
    if (reply.toLowerCase().includes(phrase.toLowerCase())) return "";
    return `${name}: ${dayLabel} ${phrase}`;
  }
  if (replyHasClock(reply, span.open, code) && replyHasClock(reply, span.close, code)) return "";
  const line = `${name}: ${dayLabel} ${formatSpan(span.open, span.close, code)}`;
  if (reply.includes(line)) return "";
  return line;
}

type HoursChunk = { type: string; id?: string; delta?: string };

function splitHold(text: string, final: boolean): { stable: string; rest: string } {
  if (final) return { stable: text, rest: "" };
  const match = text.match(/^(.*\s)(\S{0,40})$/u);
  if (!match) return { stable: "", rest: text };
  return { stable: match[1] ?? "", rest: match[2] ?? "" };
}

/** Stream rewrite for leftover English hours wording, and append a missing open–close range. */
export function attachHoursWording<T extends HoursChunk>(stream: ReadableStream<T>, code: string, enabled: boolean, question = ""): ReadableStream<T> {
  if (!enabled) return stream;
  const rewrite = !SKIP_REWRITE.has(code);
  if (!rewrite && !question) return stream;
  let hold = "";
  let full = "";
  let textId: string | undefined;
  let flushed = false;
  const emit = (controller: TransformStreamDefaultController<T>, final: boolean) => {
    const split = splitHold(hold, final);
    hold = split.rest;
    const visible = rewriteEnglishHours(split.stable, code);
    if (!visible) return;
    if (!textId) {
      textId = "hours";
      controller.enqueue({ type: "text-start", id: textId } as T);
    }
    controller.enqueue({ type: "text-delta", id: textId, delta: visible } as T);
  };
  const finish = (controller: TransformStreamDefaultController<T>) => {
    if (flushed) return;
    flushed = true;
    if (rewrite) emit(controller, true);
    const extra = hoursRangeClause(full, question, code);
    if (!extra) return;
    if (!textId) {
      textId = "hours";
      controller.enqueue({ type: "text-start", id: textId } as T);
    }
    controller.enqueue({ type: "text-delta", id: textId, delta: `\n${extra}` } as T);
  };
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
          full += chunk.delta;
          if (!rewrite) {
            controller.enqueue(chunk);
            return;
          }
          hold += chunk.delta;
          emit(controller, false);
          return;
        }
        if (chunk.type === "text-end" || chunk.type === "finish") {
          finish(controller);
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        finish(controller);
      },
    }),
  );
}
