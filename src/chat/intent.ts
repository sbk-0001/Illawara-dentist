import type { ClinicId } from "./types";

const CLINIC_TERMS: { clinic: ClinicId; re: RegExp }[] = [
  { clinic: "dapto", re: /\bdapto\b|डाप्टो|داپتو|دابتو|ড্যাপ্টো|达普托|답토|ντάπτο|ダプト/i },
  {
    clinic: "shellharbour",
    re: /\bshellharbour\b|\bshell harbor\b|barrack heights|shell cove|warilla|oak flats|albion park|kiama|windang|blackbutt|lake heights|tullimbar|warrawong|calderwood|شيلهاربر|شل ہاربر|शेलहारबर|শেলহারবার/i,
  },
  {
    clinic: "woonona",
    re: /\bwoonona\b|bulli|thirroul|corrimal|balgownie|fairy meadow|helensburgh|fernhill|mount pleasant|وونونا|वूनोना|উনোনা/i,
  },
];

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
