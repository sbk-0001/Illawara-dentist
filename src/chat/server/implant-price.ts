import type { ClinicFocus } from "../intent";

/**
 * Indexed prices for a singular implant with a crown. The asterisk is printed
 * on the Shellharbour homepage offers and is not defined anywhere in the index.
 *
 * Shellharbour homepage, "Free Dental Implant Consult": from $4500*.
 * Shellharbour homepage, "Free Smile Makeover": with $5000*.
 * Shellharbour /dental-implants/, "Implant-Retained dentures": $5000, about $30 a week.
 * Woonona /smile-gallery/, "Book your FREE Consultation Today": from $5000, about $30 a week.
 * Dapto does not list a singular implant dollar price.
 */
const SENTENCE: Record<string, { shellharbour: string; woonona: string; dapto: string; all: string }> = {
  en: {
    shellharbour:
      "Shellharbour Dentists lists a singular implant with crown from $4500* on the homepage, and $5000 (about $30 a week) on the implants page. The page does not say what * means.",
    woonona: "Woonona Dentists lists a singular implant and crown from $5000, about $30 a week.",
    dapto: "Dapto Dentists does not list a singular implant price.",
    all: "Shellharbour Dentists: singular implant with crown from $4500* on the homepage, and $5000 (about $30 a week) on the implants page. The page does not say what * means. Woonona Dentists: from $5000, about $30 a week. Dapto Dentists does not list a singular implant price.",
  },
  ml: {
    shellharbour:
      "Shellharbour Dentists ഹോംപേജിൽ സിംഗുലർ ഇംപ്ലാന്റും ക്രൗണും $4500* മുതൽ എന്ന് പറയുന്നു. ഇംപ്ലാന്റ് പേജിൽ $5000, ആഴ്ചയിൽ ഏകദേശം $30. * എന്താണെന്ന് പേജിൽ ഇല്ല.",
    woonona: "Woonona Dentists സിംഗുലർ ഇംപ്ലാന്റും ക്രൗണും $5000 മുതൽ, ആഴ്ചയിൽ ഏകദേശം $30.",
    dapto: "Dapto Dentists സിംഗുലർ ഇംപ്ലാന്റിന്റെ വില പേജിൽ ഇല്ല.",
    all: "Shellharbour Dentists: ഹോംപേജിൽ $4500* മുതൽ, ഇംപ്ലാന്റ് പേജിൽ $5000 (ആഴ്ചയിൽ ഏകദേശം $30). * എന്താണെന്ന് പേജിൽ ഇല്ല. Woonona Dentists: $5000 മുതൽ. Dapto Dentists വില പറയുന്നില്ല.",
  },
  ta: {
    shellharbour:
      "Shellharbour Dentists முகப்பில் சிங்கிள் இம்ப்ளாண்ட் மற்றும் கிரவுன் $4500* முதல். இம்ப்ளாண்ட் பக்கத்தில் $5000, வாரத்திற்கு சுமார் $30. * என்றால் என்ன என்று பக்கத்தில் இல்லை.",
    woonona: "Woonona Dentists சிங்கிள் இம்ப்ளாண்ட் மற்றும் கிரவுன் $5000 முதல், வாரத்திற்கு சுமார் $30.",
    dapto: "Dapto Dentists சிங்கிள் இம்ப்ளாண்ட் கட்டணத்தை பக்கத்தில் குறிப்பிடவில்லை.",
    all: "Shellharbour Dentists: முகப்பில் $4500* முதல், இம்ப்ளாண்ட் பக்கத்தில் $5000 (வாரத்திற்கு சுமார் $30). * விளக்கம் இல்லை. Woonona Dentists: $5000 முதல். Dapto Dentists கட்டணம் இல்லை.",
  },
  hi: {
    shellharbour:
      "Shellharbour Dentists के होमपेज पर सिंगल इम्प्लांट और क्राउन $4500* से है। इम्प्लांट पेज पर $5000, लगभग $30 प्रति सप्ताह। पेज * का अर्थ नहीं बताता।",
    woonona: "Woonona Dentists पर सिंगल इम्प्लांट और क्राउन $5000 से, लगभग $30 प्रति सप्ताह।",
    dapto: "Dapto Dentists सिंगल इम्प्लांट की कीमत नहीं लिखता।",
    all: "Shellharbour Dentists: होमपेज पर $4500* से, इम्प्लांट पेज पर $5000 (लगभग $30 प्रति सप्ताह)। * का अर्थ पेज पर नहीं है। Woonona Dentists: $5000 से। Dapto Dentists कीमत नहीं लिखता।",
  },
  bn: {
    shellharbour:
      "Shellharbour Dentists-এর হোমপেজে সিঙ্গল ইমপ্ল্যান্ট ও ক্রাউন $4500* থেকে। ইমপ্ল্যান্ট পেজে $5000, সপ্তাহে প্রায় $30। * মানে কী, পেজে নেই।",
    woonona: "Woonona Dentists-এ সিঙ্গল ইমপ্ল্যান্ট ও ক্রাউন $5000 থেকে, সপ্তাহে প্রায় $30।",
    dapto: "Dapto Dentists সিঙ্গল ইমপ্ল্যান্টের দাম লেখেনি।",
    all: "Shellharbour Dentists: হোমপেজে $4500* থেকে, ইমপ্ল্যান্ট পেজে $5000 (সপ্তাহে প্রায় $30)। * ব্যাখ্যা নেই। Woonona Dentists: $5000 থেকে। Dapto Dentists দাম লেখেনি।",
  },
  zh: {
    shellharbour: "Shellharbour Dentists 首页写单颗种植牙加牙冠 $4500* 起。种植页写 $5000，每周约 $30。页面没有解释 *。",
    woonona: "Woonona Dentists 的单颗种植牙加牙冠 $5000 起，每周约 $30。",
    dapto: "Dapto Dentists 没有列出单颗种植牙价格。",
    all: "Shellharbour Dentists：首页 $4500* 起，种植页 $5000（每周约 $30）。页面没有解释 *。Woonona Dentists：$5000 起。Dapto Dentists 没有标价。",
  },
  ar: {
    shellharbour:
      "يعرض موقع Shellharbour Dentists زراعة مع تاج من $4500* في الصفحة الرئيسية، و$5000 (حوالي $30 أسبوعيًا) في صفحة الزراعة. الصفحة لا تشرح *.",
    woonona: "يعرض Woonona Dentists زراعة مع تاج من $5000، حوالي $30 أسبوعيًا.",
    dapto: "لا يذكر Dapto Dentists سعر زراعة واحدة.",
    all: "Shellharbour Dentists: من $4500* في الصفحة الرئيسية، و$5000 في صفحة الزراعة. لا شرح لـ *. Woonona Dentists: من $5000. Dapto Dentists لا يذكر سعرًا.",
  },
  es: {
    shellharbour:
      "Shellharbour Dentists indica un implante con corona desde $4500* en la página de inicio, y $5000 (unos $30 por semana) en la página de implantes. La página no explica *.",
    woonona: "Woonona Dentists indica un implante con corona desde $5000, unos $30 por semana.",
    dapto: "Dapto Dentists no indica el precio de un implante.",
    all: "Shellharbour Dentists: desde $4500* en la portada y $5000 en la página de implantes. No explica *. Woonona Dentists: desde $5000. Dapto Dentists no indica precio.",
  },
};

const IMPLANT_PRICE =
  /implant|ഇംപ്ലാന്റ|இம்ப்ள|ইমপ্ল|इम्प्ला|种植|implante|زراعة|എത്ര|ചെലവ|எவ்வளவு|செலவு|কত|খরচ|कितन|多少|precio|cuesta|\$\s?\d/i;

export function isImplantPriceQuestion(text: string): boolean {
  return IMPLANT_PRICE.test(text) && /implant|ഇംപ്ലാന്റ|இம்ப்ள|ইমপ্ল|इम्प्ला|种植|implante|زراعة/i.test(text);
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
