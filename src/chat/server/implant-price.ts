import type { ClinicFocus } from "../intent";

/**
 * Shellharbour homepage: "Singular Implant with Crown from: $4500*".
 * The asterisk means terms and conditions apply and are discussed at the appointment.
 * Shellharbour implants page and Woonona smile gallery: "$5000 – $30 a week through payment plans".
 * Dapto dental-implants page: complimentary consultation, $50 refundable deposit. No implant price.
 */
const SENTENCE: Record<string, { shellharbour: string; woonona: string; dapto: string; all: string }> = {
  en: {
    all: "A single implant with crown starts from $4500* at Shellharbour Dentists and $5000 at Woonona Dentists, with payment plans from about $30 a week. *Conditions apply and are explained at your consultation. At Dapto Dentists, book a free implant consult to get your price. A $50 deposit confirms it and is refunded when you attend.",
    shellharbour:
      "At Shellharbour Dentists a single implant with crown starts from $4500*. Payment plans from about $30 a week are listed with the $5000 figure. *Conditions apply and are explained at your consultation.",
    woonona: "At Woonona Dentists a single implant with crown is $5000, with payment plans from about $30 a week.",
    dapto: "At Dapto Dentists, book a free implant consult to get your price. A $50 deposit confirms it and is refunded when you attend.",
  },
  ml: {
    all: "ഒറ്റ ഇംപ്ലാന്റും ക്രൗണും Shellharbour Dentists-ൽ $4500* മുതലും Woonona Dentists-ൽ $5000 ഉം ആണ്. തവണയായി ആഴ്ചയിൽ ഏകദേശം $30 മുതൽ. *നിബന്ധനകൾ കൂടിക്കാഴ്ചയിൽ പറയും. Dapto Dentists-ൽ വില അറിയാൻ സൗജന്യ ഇംപ്ലാന്റ് കൂടിക്കാഴ്ച ബുക്ക് ചെയ്യൂ. $50 ഡെപ്പോസിറ്റ് മടക്കി തരും.",
    shellharbour:
      "Shellharbour Dentists-ൽ ഒറ്റ ഇംപ്ലാന്റും ക്രൗണും $4500* മുതലാണ്. $5000 ന് ആഴ്ചയിൽ ഏകദേശം $30 മുതൽ തവണയുണ്ട്. *നിബന്ധനകൾ കൂടിക്കാഴ്ചയിൽ പറയും.",
    woonona: "Woonona Dentists-ൽ ഒറ്റ ഇംപ്ലാന്റും ക്രൗണും $5000 ആണ്. ആഴ്ചയിൽ ഏകദേശം $30 മുതൽ തവണയുണ്ട്.",
    dapto: "Dapto Dentists-ൽ വില അറിയാൻ സൗജന്യ ഇംപ്ലാന്റ് കൂടിക്കാഴ്ച ബുക്ക് ചെയ്യൂ. $50 ഡെപ്പോസിറ്റ് വന്നാൽ മടക്കി തരും.",
  },
  ta: {
    all: "ஒற்றை இம்ப்ளாண்ட் மற்றும் கிரவுன் Shellharbour Dentists-இல் $4500* முதல், Woonona Dentists-இல் $5000. தவணை வாரத்திற்கு சுமார் $30 முதல். *நிபந்தனைகள் ஆலோசனையில் சொல்லப்படும். Dapto Dentists-இல் விலை தெரிய இலவச இம்ப்ளாண்ட் ஆலோசனையை பதிவு செய்யுங்கள். $50 வைப்புத் தொகை வந்தால் திரும்பும்.",
    shellharbour:
      "Shellharbour Dentists-இல் ஒற்றை இம்ப்ளாண்ட் மற்றும் கிரவுன் $4500* முதல். $5000 உடன் வாரத்திற்கு சுமார் $30 தவணை உண்டு. *நிபந்தனைகள் ஆலோசனையில் சொல்லப்படும்.",
    woonona: "Woonona Dentists-இல் ஒற்றை இம்ப்ளாண்ட் மற்றும் கிரவுன் $5000. வாரத்திற்கு சுமார் $30 முதல் தவணை உண்டு.",
    dapto: "Dapto Dentists-இல் விலை தெரிய இலவச இம்ப்ளாண்ட் ஆலோசனையை பதிவு செய்யுங்கள். $50 வைப்புத் தொகை வந்தால் திரும்பும்.",
  },
  hi: {
    all: "एक इम्प्लांट और क्राउन Shellharbour Dentists में $4500* से और Woonona Dentists में $5000 से शुरू होता है। किस्त लगभग $30 प्रति सप्ताह से। *शर्तें सलाह के समय बताई जाती हैं। Dapto Dentists में कीमत जानने के लिए मुफ़्त इम्प्लांट सलाह बुक करें। $50 जमा आकर वापस मिलता है।",
    shellharbour:
      "Shellharbour Dentists में एक इम्प्लांट और क्राउन $4500* से शुरू होता है। $5000 के साथ लगभग $30 प्रति सप्ताह की किस्त है। *शर्तें सलाह के समय बताई जाती हैं।",
    woonona: "Woonona Dentists में एक इम्प्लांट और क्राउन $5000 है, किस्त लगभग $30 प्रति सप्ताह से।",
    dapto: "Dapto Dentists में कीमत जानने के लिए मुफ़्त इम्प्लांट सलाह बुक करें। $50 जमा आकर वापस मिलता है।",
  },
  bn: {
    all: "একটি ইমপ্ল্যান্ট ও ক্রাউন Shellharbour Dentists-এ $4500* থেকে এবং Woonona Dentists-এ $5000। কিস্তি সপ্তাহে প্রায় $30 থেকে। *শর্ত পরামর্শের সময় বলা হবে। Dapto Dentists-এ দাম জানতে ফ্রি ইমপ্ল্যান্ট পরামর্শ বুক করুন। $50 জমা এলে ফেরত হয়।",
    shellharbour:
      "Shellharbour Dentists-এ একটি ইমপ্ল্যান্ট ও ক্রাউন $4500* থেকে। $5000-এর সাথে সপ্তাহে প্রায় $30 কিস্তি আছে। *শর্ত পরামর্শের সময় বলা হবে।",
    woonona: "Woonona Dentists-এ একটি ইমপ্ল্যান্ট ও ক্রাউন $5000, কিস্তি সপ্তাহে প্রায় $30 থেকে।",
    dapto: "Dapto Dentists-এ দাম জানতে ফ্রি ইমপ্ল্যান্ট পরামর্শ বুক করুন। $50 জমা এলে ফেরত হয়।",
  },
  zh: {
    all: "单颗种植牙加牙冠，Shellharbour Dentists 从 $4500* 起，Woonona Dentists 是 $5000，分期大约每周 $30 起。*条件在咨询时说明。想知道 Dapto Dentists 的价格，请预约免费种植咨询。$50 订金到诊后退还。",
    shellharbour: "在 Shellharbour Dentists，单颗种植牙加牙冠从 $4500* 起。$5000 可分期，大约每周 $30。*条件在咨询时说明。",
    woonona: "在 Woonona Dentists，单颗种植牙加牙冠是 $5000，分期大约每周 $30 起。",
    dapto: "想知道 Dapto Dentists 的种植价格，请预约免费种植咨询。$50 订金到诊后退还。",
  },
  ar: {
    all: "زراعة واحدة مع تاج تبدأ من $4500* في Shellharbour Dentists ومن $5000 في Woonona Dentists، والأقساط من نحو $30 في الأسبوع. *تُشرح الشروط في الاستشارة. في Dapto Dentists احجز استشارة زراعة مجانية لمعرفة السعر. عربون $50 يُرد عند الحضور.",
    shellharbour:
      "في Shellharbour Dentists تبدأ الزراعة مع التاج من $4500*. توجد أقساط لنحو $30 أسبوعيًا مع $5000. *تُشرح الشروط في الاستشارة.",
    woonona: "في Woonona Dentists الزراعة مع التاج $5000، والأقساط من نحو $30 في الأسبوع.",
    dapto: "في Dapto Dentists احجز استشارة زراعة مجانية لمعرفة السعر. عربون $50 يُرد عند الحضور.",
  },
  es: {
    all: "Un implante con corona empieza desde $4500* en Shellharbour Dentists y $5000 en Woonona Dentists, con planes de pago desde unos $30 por semana. *Las condiciones se explican en la consulta. En Dapto Dentists reserve una consulta de implante gratuita para saber el precio. Un depósito de $50 se devuelve al asistir.",
    shellharbour:
      "En Shellharbour Dentists un implante con corona empieza desde $4500*. Hay planes de unos $30 por semana con la cifra de $5000. *Las condiciones se explican en la consulta.",
    woonona: "En Woonona Dentists un implante con corona cuesta $5000, con planes desde unos $30 por semana.",
    dapto: "En Dapto Dentists reserve una consulta de implante gratuita para saber el precio. Un depósito de $50 se devuelve al asistir.",
  },
};

const IMPLANT_STEM = /implant|ഇംപ്ലാന്റ|இம்ப்ள|ইমপ্ল|इम्प्ला|种植|implante|زراعة/i;
const IMPLANT_FEE =
  /how much|\bprice\b|\bcost\b|\bfee\b|\$|എത്ര|ചെലവ|വില|எவ்வளவு|செலவு|விலை|কত|খরচ|দাম|कितन|कीमत|फीस|दाम|多少|precio|cuesta|سعر|تكلف|كم/i;

export function isImplantPriceQuestion(text: string): boolean {
  if (/zirconia/i.test(text)) return false;
  return IMPLANT_STEM.test(text) && IMPLANT_FEE.test(text);
}

export function implantPriceSentence(code: string, focus: ClinicFocus): string {
  const pack = SENTENCE[code] ?? SENTENCE.en;
  if (!pack) return SENTENCE.en?.all ?? "";
  if (focus.kind === "one") return pack[focus.clinic];
  return pack.all;
}

/** Replace a price answer so $4500* and $5000 stay on the clinic that published them. */
export function guardImplantPrice(reply: string, question: string, code: string, focus: ClinicFocus): string {
  if (!isImplantPriceQuestion(question)) return reply;
  return implantPriceSentence(code, focus);
}
