import type { ClinicId } from "./types";

const CLINIC_TERMS: { clinic: ClinicId; re: RegExp }[] = [
  {
    clinic: "dapto",
    re: /\bdapto\b|डाप्टो|डैप्टो|داپتو|داپٹو|دابتو|ڈاپٹو|ڈاپتو|داپتو|ডাপ্টো|ড্যাপ্টো|ডাপটো|达普托|達普托|답토|댑토|닥토|다프토|ντάπτο|ダプト|ഡാപ്റ്റോ|ഡാർട്ടോ|ഡാറ്റോ|ഡാപ്ടോ|டாப்டோ|டாப்லோ|தாப்போ|நாட்டோ|ডাক্তার\s*ক্লিনিক/i,
  },
  {
    clinic: "shellharbour",
    re: /\bshellharbour\b|\bshell harbor\b|barrack heights|shell cove|warilla|oak flats|albion park|kiama|windang|blackbutt|lake heights|tullimbar|warrawong|calderwood|شيلهاربر|شيل هاربور|شل ہاربر|شیلہاربر|شیل ہاربر|شلهاربر|شل‌هاربر|शेलहारबर|शेलहार्बर|শেলহারবার|谢尔港|謝爾港|셸하버|쉘하버|باراك هايتس|باراک ہائٹس|巴拉克高地|배랙하이츠|배럭하이츠|बैरक हाइट्स|ব্যারাক হাইটস/i,
  },
  {
    clinic: "woonona",
    re: /\bwoonona\b|bulli|thirroul|corrimal|balgownie|fairy meadow|helensburgh|fernhill|mount pleasant|وونونا|وُونونا|वूनोना|वूनोणा|वोनोना|উনোনা|উনুনা|উনা(?=\s*ক্লিনিক)|伍诺纳|沃诺纳|烏諾納|우노나|워노나|울로나|വൂനോണ|വൂനോന|വോണോന|வூனோனா|வூனோன/i,
  },
];

/** Illawarra is the group, not one of the three clinics. */
const GROUP_TERMS = /illawarra|إلاوارا|الاوارا|ایلاوارا|इलावारा|ইলাওয়ারা|伊拉瓦拉|일라와라/i;

const LOCATION_CUES = [
  /hour|opening|open|close|address|where|parking|direction|located|phone|call|what time|which dentist|who works|dentist named/i,
  /ساعات|عنوان|أين|موقع|هاتف|موعد/,
  /समय|कहाँ|पता|घण्टा|घंटे|खुल/,
  /समय|कहाँ|ठेगाना|खुल्छ|बजे/,
  /ঠিকানা|কোথায়|সময়|খোলা|ফোন/,
  /地址|营业|几点|开门|停车|电话/,
  /주소|진료|시간|어디|전화/,
  /địa chỉ|gio|giờ|mở cửa|ở đâu/,
  /διεύθυνση|ώρ|που είναι|τηλέφωνο/i,
  /indirizzo|orari|dove|telefono/i,
  /horario|dirección|dónde|teléfono/i,
  /kothay|khula|khola|shonibar|baje|address|parking/i,
  /پتہ|فون|نمبر|کہاں|مقام|لوکیشن|آدرس|تلفن|کجاست|نشانی/,
  /alamat|telepon|di mana|jam buka/i,
];

const SEVERE = [
  /can(?:not|'t) breathe|trouble breathing|difficulty breathing|short of breath|cannot swallow|can't swallow|difficulty swallowing|trouble swallowing|uncontrolled bleeding|bleeding (?:won't|will not|does not|doesn't) stop|spreading (?:facial )?swelling|swelling (?:is )?spreading|face is swelling|facial swelling/i,
  /لا أستطيع التنفس|صعوبة في التنفس|صعوبة في البلع|نزيف لا يتوقف|تورم ينتشر|وجهي يتورم/,
  /सांस नहीं|निगल नहीं|खून नहीं रुक|चेहरा सूज/,
  /无法呼吸|呼吸困难|无法吞咽|出血不止|面部肿胀|脸肿/,
  /숨을 못|삼키기 어렵|피가 멈추지|얼굴이 붓/,
  /không thở|khó thở|không nuốt|chảy máu không cầm|sưng mặt/,
  /δεν μπορώ να αναπνεύσω|δυσκολία στην κατάποση|αιμορραγία|πρήξιμο στο πρόσωπο/i,
  /non riesco a respirare|difficoltà a deglutire|sangue non si ferma|gonfiore del viso/i,
  /no puedo respirar|dificultad para tragar|sangrado no para|hinchazón de la cara/i,
  /nisshas nite parchi na|shash nite parchi na|shash nite parchina|khun bondho hocche na/,
  /saans nahi|saans nahin|nigal nahi|khoon nahi ruk|chehra sooj/,
];

/** Standalone "doctor" in any script is not the suburb Dapto. */
const DOCTOR_TOKEN = /^(?:doctor|dokter|doktor|डॉक्टर|ডাক্তার|ডাক্তৰ|ഡോക്ടർ|டாக்டர்|医生)$/iu;

const FUZZY_STEMS: { clinic: ClinicId; stems: readonly string[] }[] = [
  { clinic: "dapto", stems: ["ഡാപ്റ്റോ", "டாப்டோ", "ড্যাপটো", "डैप्टो"] },
  { clinic: "woonona", stems: ["വൂനോണ", "വൂനോന", "வூனோனா", "উনোনা", "वूनोना"] },
  { clinic: "shellharbour", stems: ["শেলহারবার", "शेलहार्बर"] },
];

const DAPTO_P = /[പபপपپ]/u;

function editDistance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (Math.abs(left.length - right.length) > 2) return 3;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    let rowMin = row[0];
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const next = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      previous = current;
      row[j] = next;
      if (next < rowMin) rowMin = next;
    }
    if (rowMin > 2) return 3;
  }
  return row[right.length] ?? 3;
}

function fuzzyClinic(token: string): ClinicId | null {
  if (Array.from(token).length < 4 || DOCTOR_TOKEN.test(token)) return null;
  let best: { clinic: ClinicId; distance: number } | null = null;
  for (const group of FUZZY_STEMS) {
    for (const stem of group.stems) {
      const distance = editDistance(token, stem);
      if (distance > 2) continue;
      if (distance === 2 && group.clinic === "dapto" && !DAPTO_P.test(token)) continue;
      if (!best || distance < best.distance) best = { clinic: group.clinic, distance };
    }
  }
  return best?.clinic ?? null;
}

const NATIVE_WORD = /[\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0D00-\u0D7F\u0600-\u06FF]+/gu;

function fuzzyHits(text: string): { clinic: ClinicId; index: number }[] {
  const hits: { clinic: ClinicId; index: number }[] = [];
  for (const match of text.matchAll(NATIVE_WORD)) {
    const clinic = fuzzyClinic(match[0]);
    if (clinic) hits.push({ clinic, index: match.index ?? 0 });
  }
  return hits;
}

export function mentionedClinics(text: string): ClinicId[] {
  const found: ClinicId[] = [];
  for (const term of CLINIC_TERMS) {
    if (term.re.test(text) && !found.includes(term.clinic)) found.push(term.clinic);
  }
  for (const hit of fuzzyHits(text)) {
    if (!found.includes(hit.clinic)) found.push(hit.clinic);
  }
  return found;
}

/** The clinic named latest in this text. Clinic-list order is not mention order. */
export function lastClinicInText(text: string): ClinicId | null {
  let best = -1;
  let clinic: ClinicId | null = null;
  for (const term of CLINIC_TERMS) {
    const re = new RegExp(term.re.source, term.re.flags.includes("g") ? term.re.flags : `${term.re.flags}g`);
    for (let match = re.exec(text); match; match = re.exec(text)) {
      if (match.index >= best) {
        best = match.index;
        clinic = term.clinic;
      }
    }
  }
  for (const hit of fuzzyHits(text)) {
    if (hit.index >= best) {
      best = hit.index;
      clinic = hit.clinic;
    }
  }
  return clinic;
}

/** The clinic mentioned most recently, starting from the latest text. */
export function lastMentionedClinic(texts: readonly string[]): ClinicId | null {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const clinic = lastClinicInText(texts[i] || "");
    if (clinic) return clinic;
  }
  return null;
}

export function mentionsServiceArea(text: string): boolean {
  return GROUP_TERMS.test(text) || mentionedClinics(text).length > 0;
}

const FOLLOW_UP = /^(?:and|also|what about|how about|وما|و ما|और|aur|그리고|还有|then)\b/i;

/** A short location question can inherit the clinic named in a recent turn. */
export function isClinicFollowUp(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 180) return false;
  if (FOLLOW_UP.test(trimmed)) return true;
  return isLocationQuestion(trimmed);
}

/** Latest question, plus the most recent earlier turn that names a clinic when this one is a follow-up. */
export function clinicContextText(turns: string[]): string {
  const latest = turns[turns.length - 1] || "";
  if (!latest || mentionedClinics(latest).length || !isClinicFollowUp(latest)) return latest;
  for (let i = turns.length - 2; i >= Math.max(0, turns.length - 4); i -= 1) {
    const prior = turns[i] || "";
    if (mentionedClinics(prior).length || mentionsServiceArea(prior)) return `${prior}\n${latest}`;
  }
  return latest;
}

export function isLocationQuestion(text: string): boolean {
  return LOCATION_CUES.some((re) => re.test(text));
}

export type ClinicFocus = { kind: "one"; clinic: ClinicId } | { kind: "many"; clinics: ClinicId[] } | { kind: "ask" } | { kind: "any" };

export function clinicFocus(text: string): ClinicFocus {
  const clinics = mentionedClinics(text);
  if (clinics.length === 1) return { kind: "one", clinic: clinics[0] };
  if (clinics.length > 1) return { kind: "many", clinics };
  if (isLocationQuestion(text)) return { kind: "ask" };
  return { kind: "any" };
}

export function isSevereEmergency(text: string): boolean {
  return SEVERE.some((re) => re.test(text));
}
