/**
 * English service phrases the model copies out of the English pages.
 * Longest phrases are replaced first, on the stream, so a mid-reply run
 * is rewritten without a second model call.
 */
const PHRASES: Record<string, readonly [string, string][]> = {
  ml: [
    ["singular dental implants", "ഒറ്റ ദന്ത ഇംപ്ലാന്റ്"],
    ["payment plan", "തവണ പദ്ധതി"],
    ["interest free", "പലിശയില്ലാത്ത"],
    ["interest-free", "പലിശയില്ലാത്ത"],
    ["opening hours", "പ്രവർത്തന സമയം"],
    ["invisalign", "ഇൻവിസലൈൻ"],
    ["checkup", "പരിശോധന"],
    ["പല്ല് സഫെദകരണം", "പല്ലുകൾ വെളുപ്പിക്കൽ"],
    ["teeth whitening", "പല്ലുകൾ വെളുപ്പിക്കൽ"],
    ["check-up", "പരിശോധന"],
    ["toothache", "പല്ലുവേദന"],
    ["appointment", "അപ്പോയിന്റ്മെന്റ്"],
    ["emergency", "അടിയന്തരം"],
    ["whitening", "പല്ലുകൾ വെളുപ്പിക്കൽ"],
    ["implant", "ഇംപ്ലാന്റ്"],
    ["crown", "ക്രൗൺ"],
    ["cleaning", "പല്ല് വൃത്തിയാക്കൽ"],
    ["booking", "ബുക്കിംഗ്"],
    ["address", "വിലാസം"],
    ["phone", "ഫോൺ"],
    ["fees", "ഫീസ്"],
    ["hours", "സമയം"],
    ["from", "മുതൽ"],
    ["and", "ഒപ്പം"],
  ],
  ta: [
    ["singular dental implants", "ஒற்றை பல் இம்ப்ளாண்ட்"],
    ["payment plan", "தவணைத் திட்டம்"],
    ["interest free", "வட்டியில்லா"],
    ["interest-free", "வட்டியில்லா"],
    ["opening hours", "திறந்திருக்கும் நேரம்"],
    ["invisalign", "இன்விசலைன்"],
    ["checkup", "பரிசோதனை"],
    ["teeth whitening", "பல் வெண்மையாக்கல்"],
    ["check-up", "பரிசோதனை"],
    ["toothache", "பல்வலி"],
    ["appointment", "அப்பாயிண்ட்மெண்ட்"],
    ["emergency", "அவசரம்"],
    ["whitening", "பல் வெண்மையாக்கல்"],
    ["implant", "இம்ப்ளாண்ட்"],
    ["crown", "கிரவுன்"],
    ["cleaning", "பல் சுத்தம்"],
    ["booking", "முன்பதிவு"],
    ["address", "முகவரி"],
    ["phone", "தொலைபேசி"],
    ["fees", "கட்டணம்"],
    ["hours", "நேரம்"],
    ["from", "முதல்"],
    ["and", "மற்றும்"],
  ],
  bn: [
    ["singular dental implants", "একক দাঁতের ইমপ্ল্যান্ট"],
    ["payment plan", "কিস্তি পরিকল্পনা"],
    ["interest free", "সুদমুক্ত"],
    ["interest-free", "সুদমুক্ত"],
    ["opening hours", "খোলার সময়"],
    ["checkup", "চেকআপ"],
    ["check-up", "চেকআপ"],
    ["cleaning", "পরিষ্কার"],
    ["booking", "বুকিং"],
    ["address", "ঠিকানা"],
    ["phone", "ফোন"],
    ["fees", "ফি"],
    ["singular implant with crown", "ক্রাউনসহ সিঙ্গল ইমপ্ল্যান্ট"],
    ["pain relief", "ব্যথা উপশম"],
    ["stabilisation", "স্থিতিশীলকরণ"],
    ["stabilization", "স্থিতিশীলকরণ"],
    ["assessment", "মূল্যায়ন"],
    ["availability", "প্রাপ্যতা"],
    ["implant", "ইমপ্ল্যান্ট"],
    ["crown", "ক্রাউন"],
    ["professional teeth whitening", "পেশাদার দাঁত সাদা করা"],
    ["teeth whitening", "দাঁত সাদা করা"],
    ["suspected jaw fracture", "সন্দেহজনক চোয়াল ভাঙা"],
    ["jaw fracture", "চোয়াল ভাঙা"],
    ["emergency appointment slots", "জরুরি অ্যাপয়েন্টমেন্টের সময়"],
    ["emergency appointment slot", "জরুরি অ্যাপয়েন্টমেন্টের সময়"],
    ["emergency appointment", "জরুরি অ্যাপয়েন্টমেন্ট"],
    ["same-day treatment", "একই দিনের চিকিৎসা"],
    ["same day treatment", "একই দিনের চিকিৎসা"],
    ["urgent dental concern", "জরুরি দাঁতের সমস্যা"],
    ["urgent medical help", "জরুরি চিকিৎসা সহায়তা"],
    ["broken tooth", "ভাঙা দাঁত"],
    ["toothache", "দাঁতের ব্যথা"],
    ["swelling", "ফোলা"],
    ["medical help", "চিকিৎসা সহায়তা"],
    ["whitening", "দাঁত সাদা করা"],
    ["urgent", "জরুরি"],
    ["dental", "দাঁতের"],
    ["concern", "সমস্যা"],
    ["invisalign", "ইনভিসালাইন"],
    ["appointment", "অ্যাপয়েন্টমেন্ট"],
  ],
  hi: [
    ["singular dental implants", "एकल दंत इम्प्लांट"],
    ["payment plan", "किस्त योजना"],
    ["interest free", "ब्याज मुक्त"],
    ["interest-free", "ब्याज मुक्त"],
    ["opening hours", "खुलने का समय"],
    ["checkup", "जाँच"],
    ["check-up", "जाँच"],
    ["cleaning", "सफाई"],
    ["booking", "बुकिंग"],
    ["address", "पता"],
    ["phone", "फ़ोन"],
    ["fees", "शुल्क"],
    ["singular implant with crown", "क्राउन के साथ सिंगल इम्प्लांट"],
    ["pain relief", "दर्द से राहत"],
    ["stabilisation", "स्थिरीकरण"],
    ["stabilization", "स्थिरीकरण"],
    ["assessment", "आकलन"],
    ["availability", "उपलब्धता"],
    ["implant", "इम्प्लांट"],
    ["crown", "क्राउन"],
    ["professional teeth whitening", "पेशेवर दांत सफ़ेद करना"],
    ["teeth whitening", "दांत सफ़ेद करना"],
    ["suspected jaw fracture", "संदिग्ध जबड़े की फ्रैक्चर"],
    ["jaw fracture", "जबड़े की फ्रैक्चर"],
    ["emergency appointment slots", "आपातकालीन अपॉइंटमेंट के समय"],
    ["emergency appointment slot", "आपातकालीन अपॉइंटमेंट का समय"],
    ["emergency appointment", "आपातकालीन अपॉइंटमेंट"],
    ["same-day treatment", "उसी दिन का इलाज"],
    ["same day treatment", "उसी दिन का इलाज"],
    ["urgent dental concern", "जरूरी दंत समस्या"],
    ["urgent medical help", "जरूरी चिकित्सा सहायता"],
    ["broken tooth", "टूटा दांत"],
    ["toothache", "दांत का दर्द"],
    ["swelling", "सूजन"],
    ["medical help", "चिकित्सा सहायता"],
    ["whitening", "दांत सफ़ेद करना"],
    ["दांत सादा", "दांत सफ़ेद करना"],
    ["दांतों की सादा", "दांतों की सफ़ेदी"],
    ["urgent", "जरूरी"],
    ["dental", "दंत"],
    ["concern", "समस्या"],
    ["invisalign", "इनविसलाइन"],
    ["appointment", "अपॉइंटमेंट"],
  ],
  es: [
    ["opening hours", "horario"],
    ["check-up", "revisión"],
    ["implant", "implante"],
    ["crown", "corona"],
    ["cleaning", "limpieza"],
    ["booking", "reserva"],
    ["address", "dirección"],
    ["phone", "teléfono"],
    ["fees", "tarifas"],
    ["professional teeth whitening", "blanqueamiento dental profesional"],
    ["teeth whitening", "blanqueamiento dental"],
    ["suspected jaw fracture", "posible fractura de mandíbula"],
    ["jaw fracture", "fractura de mandíbula"],
    ["emergency appointment slots", "horarios de cita de urgencia"],
    ["emergency appointment slot", "horario de cita de urgencia"],
    ["emergency appointment", "cita de urgencia"],
    ["same-day treatment", "tratamiento el mismo día"],
    ["same day treatment", "tratamiento el mismo día"],
    ["urgent dental concern", "urgencia dental"],
    ["urgent medical help", "ayuda médica urgente"],
    ["broken tooth", "diente roto"],
    ["toothache", "dolor de muelas"],
    ["swelling", "hinchazón"],
  ],
  ar: [
    ["opening hours", "ساعات العمل"],
    ["check-up", "فحص"],
    ["toothache", "ألم الأسنان"],
    ["implant", "زراعة"],
    ["crown", "تاج"],
    ["cleaning", "تنظيف"],
    ["booking", "الحجز"],
    ["address", "العنوان"],
    ["phone", "الهاتف"],
    ["fees", "الرسوم"],
    ["emergency appointment", "موعد طارئ"],
    ["same day treatment", "علاج في اليوم نفسه"],
    ["same-day treatment", "علاج في اليوم نفسه"],
    ["urgent dental concern", "مشكلة أسنان عاجلة"],
    ["urgent medical help", "مساعدة طبية عاجلة"],
    ["broken tooth", "سن مكسور"],
    ["toothache", "ألم الأسنان"],
    ["swelling", "تورم"],
    ["jaw fracture", "كسر في الفك"],
  ],
  zh: [
    ["opening hours", "营业时间"],
    ["check-up", "检查"],
    ["implant", "种植牙"],
    ["crown", "牙冠"],
    ["cleaning", "洗牙"],
    ["address", "地址"],
    ["phone", "电话"],
    ["fees", "费用"],
    ["emergency appointment", "急诊预约"],
    ["same day treatment", "当天治疗"],
    ["same-day treatment", "当天治疗"],
    ["urgent dental concern", "紧急牙科问题"],
    ["urgent medical help", "紧急医疗帮助"],
    ["broken tooth", "断牙"],
    ["toothache", "牙痛"],
    ["swelling", "肿胀"],
    ["jaw fracture", "颌骨骨折"],
  ],
  vi: [
    ["teeth whitening", "tẩy trắng răng"],
    ["emergency appointment", "lịch hẹn khẩn"],
    ["same day treatment", "điều trị trong ngày"],
    ["same-day treatment", "điều trị trong ngày"],
    ["broken tooth", "răng gãy"],
    ["toothache", "đau răng"],
    ["swelling", "sưng"],
    ["jaw fracture", "gãy xương hàm"],
  ],
  ko: [
    ["teeth whitening", "치아 미백"],
    ["emergency appointment", "응급 예약"],
    ["same day treatment", "당일 치료"],
    ["same-day treatment", "당일 치료"],
    ["broken tooth", "부러진 치아"],
    ["toothache", "치통"],
    ["swelling", "부기"],
    ["jaw fracture", "턱뼈 골절"],
  ],
};

function phrasesFor(code: string): readonly [string, string][] {
  if (code === "bn-Latn") return PHRASES.bn;
  if (code === "hi-Latn") return PHRASES.hi;
  return PHRASES[code] ?? [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROTECTED = /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d/gi;

function replacePhrases(text: string, code: string): string {
  const phrases = phrasesFor(code);
  if (!phrases.length || !text) return text;
  let out = text;
  for (const [from, to] of phrases) {
    const latin = /^[A-Za-z]/.test(from);
    const pattern = latin ? `(?<![A-Za-z])${escapeRegExp(from)}(?![A-Za-z])` : escapeRegExp(from);
    out = out.replace(new RegExp(pattern, latin ? "gi" : "g"), to);
  }
  return out;
}

/** English phrases still in a non-English reply. URLs, emails and phone numbers are copied unchanged. */
export function applyGlossary(text: string, code: string): string {
  if (!text) return text;
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PROTECTED)) {
    const index = match.index ?? 0;
    out += replacePhrases(text.slice(last, index), code);
    out += match[0];
    last = index + match[0].length;
  }
  return out + replacePhrases(text.slice(last), code);
}

/** Lines for the prompt. Empty for English. */
export function glossaryBlock(code: string): string {
  const phrases = phrasesFor(code).filter(([from]) => /^[A-Za-z]/.test(from));
  if (!phrases.length) return "";
  const lines = phrases.map(([from, to]) => `${from} = ${to}`);
  return `GLOSSARY\nUse these ${code} words. Do not leave the English:\n${lines.join("\n")}`;
}

/** Hold a suffix that is the start of a glossary phrase so a split chunk still matches. */
export function createGlossaryFilter(code: string) {
  const sources = phrasesFor(code).map(([from]) => from.toLowerCase());
  let held = "";
  const holdLength = (text: string): number => {
    if (/https?:\/\/\S*$/i.test(text)) return 0;
    const end = text.slice(-64);
    const unprotected = end.replace(PROTECTED, "\n");
    const tail = unprotected.slice(unprotected.lastIndexOf("\n") + 1).toLowerCase();
    let size = 0;
    for (const phrase of sources) {
      const max = Math.min(phrase.length - 1, tail.length);
      for (let n = max; n > size; n -= 1) {
        if (n < 4) break;
        if (phrase.startsWith(tail.slice(-n))) size = n;
      }
    }
    return size;
  };
  return {
    push(delta: string): string {
      const combined = held + delta;
      const size = holdLength(combined);
      const ready = combined.slice(0, combined.length - size);
      held = combined.slice(combined.length - size);
      return applyGlossary(ready, code);
    },
    flush(): string {
      const rest = applyGlossary(held, code);
      held = "";
      return rest;
    },
  };
}
