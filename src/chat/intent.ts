import type { ClinicId } from "./types";

const CLINIC_TERMS: { clinic: ClinicId; re: RegExp }[] = [
  {
    clinic: "dapto",
    re: /\bdapto\b|डाप्टो|डैप्टो|داپتو|داپٹو|دابتو|ڈاپٹو|ڈاپتو|داپتو|ড্যাপ্টো|ডাপটো|达普托|達普托|답토|댑토|닥토|다프토|ντάπτο|ダプト/i,
  },
  {
    clinic: "shellharbour",
    re: /\bshellharbour\b|\bshell harbor\b|barrack heights|shell cove|warilla|oak flats|albion park|kiama|windang|blackbutt|lake heights|tullimbar|warrawong|calderwood|شيلهاربر|شيل هاربور|شل ہاربر|شیلہاربر|شیل ہاربر|شلهاربر|شل‌هاربر|शेलहारबर|शेलहार्बर|শেলহারবার|谢尔港|謝爾港|셸하버|쉘하버|باراك هايتس|باراک ہائٹس|巴拉克高地|배랙하이츠|배럭하이츠|बैरक हाइट्स|ব্যারাক হাইটস/i,
  },
  {
    clinic: "woonona",
    re: /\bwoonona\b|bulli|thirroul|corrimal|balgownie|fairy meadow|helensburgh|fernhill|mount pleasant|وونونا|وُونونا|वूनोना|वूनोणा|উনোনা|伍诺纳|沃诺纳|烏諾納|우노나|워노나|울로나/i,
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

export function mentionedClinics(text: string): ClinicId[] {
  const found: ClinicId[] = [];
  for (const term of CLINIC_TERMS) {
    if (term.re.test(text) && !found.includes(term.clinic)) found.push(term.clinic);
  }
  return found;
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
