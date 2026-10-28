/**
 * The English fee sentence is copied from retrieved clinic pages, not from a
 * hardcoded disclaimer. It must not stay in English when the reply is not English.
 */
export const FEE_CAVEAT_EN =
  "Fees, private health benefits and third-party payment arrangements vary. Please confirm current details before relying on an option.";

const FEE_CAVEAT: Record<string, string> = {
  en: FEE_CAVEAT_EN,
  bn: "ফি, প্রাইভেট হেলথ সুবিধা এবং তৃতীয় পক্ষের পেমেন্ট ব্যবস্থা ভিন্ন হতে পারে। কোনো সিদ্ধান্তের আগে বর্তমান তথ্য যাচাই করুন।",
  "bn-Latn": "Fees, private health benefits ar third-party payment alada hoite pare. Nirbhoyer age bortoman details confirm korun.",
  hi: "शुल्क, प्राइवेट हेल्थ लाभ और तीसरे पक्ष की भुगतान व्यवस्था बदल सकती है। भरोसा करने से पहले मौजूदा जानकारी जाँच लें।",
  "hi-Latn": "Fees, private health benefits aur third-party payment badal sakte hain. Bharosa karne se pehle current details confirm karein.",
  ar: "تختلف الرسوم ومزايا التأمين الخاص وترتيبات الدفع عبر طرف ثالث. يُرجى التأكد من التفاصيل الحالية قبل الاعتماد على أي خيار.",
  ur: "فیس، پرائیویٹ ہیلتھ فوائد اور تھرڈ پارٹی ادائیگی مختلف ہو سکتی ہے۔ کسی آپشن پر انحصار سے پہلے موجودہ تفصیل چیک کریں۔",
  fa: "هزینه‌ها، مزایای بیمه خصوصی و ترتیب پرداخت شخص ثالث فرق می‌کند. پیش از اتکا به یک گزینه، جزئیات فعلی را بررسی کنید.",
  he: "העמלות, הטבות ביטוח פרטי והסדרי תשלום של צד שלישי משתנים. בדקו את הפרטים העדכניים לפני שמסתמכים על אפשרות.",
  zh: "费用、私人医疗保险和第三方付款安排会有所不同。在依赖某个选项之前，请确认当前信息。",
  ja: "料金、民間保険の給付、第三者の支払い条件は異なる場合があります。利用する前に最新の内容をご確認ください。",
  ko: "비용, 민간 건강보험 혜택, 제3자 결제 조건은 달라질 수 있습니다. 선택하기 전에 현재 내용을 확인하세요.",
  es: "Las tarifas, las prestaciones del seguro privado y los pagos de terceros varían. Confirme los datos actuales antes de confiar en una opción.",
  vi: "Phí, quyền lợi bảo hiểm tư nhân và hình thức thanh toán bên thứ ba có thể khác nhau. Hãy xác nhận thông tin hiện tại trước khi dựa vào một lựa chọn.",
  el: "Οι χρεώσεις, οι παροχές ιδιωτικής ασφάλισης και οι πληρωμές τρίτων διαφέρουν. Επιβεβαιώστε τα τρέχοντα στοιχεία πριν βασιστείτε σε μια επιλογή.",
  it: "Le tariffe, le coperture sanitarie private e i pagamenti di terzi variano. Confermi i dettagli attuali prima di fare affidamento su un'opzione.",
  fr: "Les tarifs, les remboursements de mutuelle et les paiements par un tiers varient. Vérifiez les informations actuelles avant de vous fier à une option.",
  de: "Gebühren, private Versicherungsleistungen und Zahlungen über Dritte können sich unterscheiden. Bitte prüfen Sie die aktuellen Angaben, bevor Sie sich auf eine Option verlassen.",
  pt: "As taxas, os benefícios de plano de saúde e os pagamentos de terceiros variam. Confirme os dados atuais antes de confiar numa opção.",
  id: "Biaya, manfaat asuransi swasta, dan pembayaran pihak ketiga dapat berbeda. Konfirmasikan detail terbaru sebelum mengandalkan suatu pilihan.",
  ms: "Yuran, manfaat insurans swasta dan pembayaran pihak ketiga boleh berbeza. Sahkan butiran semasa sebelum bergantung pada sesuatu pilihan.",
  ne: "शुल्क, निजी स्वास्थ्य लाभ र तेस्रो पक्षको भुक्तानी फरक हुन सक्छ। भर पर्नुअघि हालको विवरण जाँच गर्नुहोस्।",
  pa: "ਫੀਸ, ਪ੍ਰਾਈਵੇਟ ਹੈਲਥ ਲਾਭ ਅਤੇ ਤੀਜੀ ਧਿਰ ਦੀ ਅਦਾਇਗੀ ਵੱਖ ਹੋ ਸਕਦੀ ਹੈ। ਭਰੋਸਾ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਮੌਜੂਦਾ ਵੇਰਵਾ ਜਾਂਚ ਲਵੋ।",
  ta: "கட்டணம், தனியார் காப்பீட்டு பலன் மற்றும் மூன்றாம் தரப்பு கட்டண ஏற்பாடு மாறலாம். ஒரு தேர்வை நம்புவதற்கு முன் தற்போதைய விவரத்தை உறுதிசெய்யுங்கள்.",
  ml: "ഫീസ്, സ്വകാര്യ ആരോഗ്യ ആനുകൂല്യങ്ങൾ, മൂന്നാം കക്ഷി പണമടയ്ക്കൽ എന്നിവ വ്യത്യാസപ്പെടാം. ഒരു ഓപ്ഷനെ ആശ്രയിക്കുന്നതിന് മുമ്പ് നിലവിലെ വിവരം ഉറപ്പാക്കുക.",
  te: "ఫీజులు, ప్రైవేట్ హెల్త్ ప్రయోజనాలు మరియు మూడవ పక్ష చెల్లింపులు మారవచ్చు. ఒక ఎంపికపై ఆధారపడే ముందు ప్రస్తుత వివరాలు నిర్ధారించండి.",
  ru: "Стоимость, выплаты частной страховки и условия оплаты через третьих лиц различаются. Уточните актуальные данные, прежде чем полагаться на вариант.",
  th: "ค่าใช้จ่าย สิทธิประกันเอกชน และการชำระผ่านบุคคลที่สามอาจแตกต่างกัน โปรดตรวจสอบข้อมูลล่าสุดก่อนตัดสินใจ",
};

const TRY_AGAIN: Record<string, string> = {
  en: "Please try again, or call the clinic.",
  bn: "আবার চেষ্টা করুন, অথবা ক্লিনিকে ফোন করুন।",
  "bn-Latn": "Abar try korun, othoba clinic e phone korun.",
  hi: "कृपया फिर कोशिश करें, या क्लिनिक को फ़ोन करें।",
  "hi-Latn": "Kripya phir koshish karein, ya clinic ko phone karein.",
  ar: "يرجى المحاولة مرة أخرى، أو الاتصال بالعيادة.",
  ur: "براہ کرم دوبارہ کوشش کریں، یا کلینک کو فون کریں۔",
  fa: "لطفاً دوباره تلاش کنید، یا با درمانگاه تماس بگیرید.",
  he: "נסו שוב, או התקשרו למרפאה.",
  zh: "请再试一次，或致电诊所。",
  ja: "もう一度お試しください。または医院にお電話ください。",
  ko: "다시 시도하거나 병원에 전화해 주세요.",
  es: "Inténtelo de nuevo o llame a la clínica.",
  vi: "Vui lòng thử lại, hoặc gọi cho phòng khám.",
  el: "Δοκιμάστε ξανά ή τηλεφωνήστε στο ιατρείο.",
  it: "Riprovi, oppure chiami lo studio.",
  fr: "Veuillez réessayer, ou appeler le cabinet.",
  de: "Bitte versuchen Sie es erneut oder rufen Sie die Praxis an.",
  pt: "Tente de novo ou ligue para a clínica.",
  id: "Silakan coba lagi, atau telepon klinik.",
  ms: "Sila cuba lagi, atau telefon klinik.",
  ne: "कृपया फेरि प्रयास गर्नुहोस्, वा क्लिनिकमा फोन गर्नुहोस्।",
  pa: "ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ, ਜਾਂ ਕਲੀਨਿਕ ਨੂੰ ਫ਼ੋਨ ਕਰੋ।",
  ta: "மீண்டும் முயற்சிக்கவும், அல்லது கிளினிக்கை அழைக்கவும்.",
  ml: "വീണ്ടും ശ്രമിക്കുക, അല്ലെങ്കിൽ ക്ലിനിക്കിൽ ഫോൺ ചെയ്യുക.",
  te: "దయచేసి మళ్లీ ప్రయత్నించండి, లేదా క్లినిక్‌కు ఫోన్ చేయండి.",
  ru: "Попробуйте ещё раз или позвоните в клинику.",
  th: "โปรดลองอีกครั้ง หรือโทรหาคลินิก",
};

/** Remove the English fee sentence from retrieved page text before it reaches the model. */
export function stripFeeCaveat(text: string): string {
  if (!text.includes(FEE_CAVEAT_EN)) return text;
  return text
    .split(FEE_CAVEAT_EN)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Replace the English fee sentence when the reply language is not English. */
export function localizeSystemEnglish(text: string, code: string): string {
  if (!code || code === "en" || !text.includes(FEE_CAVEAT_EN)) return text;
  return text.split(FEE_CAVEAT_EN).join(FEE_CAVEAT[code] ?? FEE_CAVEAT.en);
}

export function tryAgainMessage(code: string, clinics: { name: string; phone: string }[]): string {
  const line = TRY_AGAIN[code] ?? TRY_AGAIN.en;
  const phones = clinics
    .filter((clinic) => clinic.name && clinic.phone)
    .map((clinic) => `${clinic.name}: ${clinic.phone}`)
    .join("\n");
  return phones ? `${line}\n${phones}` : line;
}

/** Hold a suffix that might still grow into the English fee sentence. */
export function createSystemTextFilter(code: string) {
  let tail = "";
  const push = (delta: string): string => {
    const combined = tail + delta;
    if (combined.includes(FEE_CAVEAT_EN)) {
      tail = "";
      return localizeSystemEnglish(combined, code);
    }
    let hold = 0;
    const max = Math.min(combined.length, FEE_CAVEAT_EN.length - 1);
    for (let size = max; size > 0; size -= 1) {
      if (FEE_CAVEAT_EN.startsWith(combined.slice(-size))) {
        hold = size;
        break;
      }
    }
    tail = hold ? combined.slice(-hold) : "";
    return combined.slice(0, combined.length - hold);
  };
  return {
    push,
    flush(): string {
      const rest = localizeSystemEnglish(tail, code);
      tail = "";
      return rest;
    },
  };
}
