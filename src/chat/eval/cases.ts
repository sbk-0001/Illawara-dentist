import type { ClinicId } from "../types";
import type { GroundingKind } from "../server/grounding";

export type EvalCase = {
  id: string;
  language: string;
  kind: GroundingKind;
  clinic?: ClinicId;
  prompt: string;
  severe?: boolean;
};

const languages: {
  language: string;
  fee: string;
  hours: string;
  emergency: string;
  unknown: string;
  offtopic: string;
}[] = [
  {
    language: "bn",
    fee: "ড্যাপ্টো ক্লিনিকে চেকআপ এবং পরিষ্কারের খরচ কত?",
    hours: "Shellharbour এ শনিবার কখন খোলা থাকে?",
    emergency: "আমার দাঁত ভেঙে গেছে এবং ব্যথা করছে। আমি কী করব?",
    unknown: "আপনারা কি রাতে কুকুর রাখেন?",
    offtopic: "২০২২ বিশ্বকাপ কে জিতেছে?",
  },
  {
    language: "ar",
    fee: "كم تبلغ تكلفة الفحص والتنظيف في عيادة دابتو؟",
    hours: "ما هي ساعات العمل يوم السبت في شيلهاربر؟",
    emergency: "لقد كسرت سني ويؤلمني. ماذا أفعل؟",
    unknown: "هل تؤوون الكلاب في العيادة ليلاً؟",
    offtopic: "من فاز بكأس العالم ٢٠٢٢؟",
  },
  {
    language: "hi",
    fee: "डाप्टो में चेकअप और सफाई की फीस कितनी है?",
    hours: "Shellharbour में शनिवार को क्लिनिक कितने बजे खुलता है?",
    emergency: "मेरा दांत टूट गया है और दर्द हो रहा है। मैं क्या करूँ?",
    unknown: "क्या आप क्लिनिक में कुत्तों को रात भर रखते हैं?",
    offtopic: "2022 विश्व कप किसने जीता?",
  },
  {
    language: "zh",
    fee: "达普托诊所的检查和洗牙费用是多少？",
    hours: "Shellharbour诊所星期六几点开门？",
    emergency: "我的牙齿断了，很疼。我该怎么办？",
    unknown: "你们诊所过夜收留狗吗？",
    offtopic: "谁赢得了2022年世界杯？",
  },
  {
    language: "es",
    fee: "¿Cuánto cuesta la revisión y la limpieza en la clínica de Dapto?",
    hours: "¿Cuál es el horario del sábado en la clínica de Shellharbour?",
    emergency: "Se me ha roto un diente y me duele. ¿Qué hago?",
    unknown: "¿Alojáis perros por la noche en la clínica?",
    offtopic: "¿Quién ganó la Copa del Mundo de 2022?",
  },
  {
    language: "bn-Latn",
    fee: "Dapto te check up ar clean er dam koto?",
    hours: "Shellharbour e Saturday te kobe khola thaken?",
    emergency: "amar daat vhenge geche, byatha korche. ami ki korbo?",
    unknown: "apnar clinic e kukur raate thake? ami jante chai",
    offtopic: "tumi bolte paro 2022 world cup ke jiteche?",
  },
  {
    language: "hi-Latn",
    fee: "Dapto me check up aur cleaning ka fee kitna hai?",
    hours: "Shellharbour clinic Saturday ko kitne baje khulti hai?",
    emergency: "mera daant toot gaya hai aur dard ho raha hai. main kya karun?",
    unknown: "kya aap clinic me kutton ko raat bhar rakhte ho?",
    offtopic: "2022 world cup kaun jeeta, mujhe batao?",
  },
  {
    language: "vi",
    fee: "Phí khám và cạo vôi răng ở phòng khám Dapto là bao nhiêu?",
    hours: "Phòng khám Shellharbour mở cửa lúc mấy giờ vào thứ Bảy?",
    emergency: "Răng của tôi bị gãy và rất đau. Tôi nên làm gì?",
    unknown: "Phòng khám có giữ chó qua đêm không?",
    offtopic: "Ai đã vô địch World Cup 2022?",
  },
  {
    language: "ne",
    fee: "डाप्टो क्लिनिकमा जाँच र सफाईको शुल्क कति हो?",
    hours: "Shellharbour क्लिनिक शनिबार कति बजे खुल्छ?",
    emergency: "मेरो दाँत भाँचिएको छ र दुख्छ। म के गरूँ?",
    unknown: "के तपाईं क्लिनिकमा कुकुर राख्नुहुन्छ?",
    offtopic: "२०२२ विश्वकप कसले जित्यो हो?",
  },
  {
    language: "ko",
    fee: "Dapto 치과의 검진과 스케일링 비용은 얼마인가요?",
    hours: "Shellharbour 치과는 토요일에 몇 시에 문을 열나요?",
    emergency: "이가 부러졌고 아파요. 어떻게 해야 하나요?",
    unknown: "치과에서 강아지를 하룻밤 맡아 주나요?",
    offtopic: "2022년 월드컵은 누가 이겼나요?",
  },
  {
    language: "el",
    fee: "Πόσο κοστίζει ο έλεγχος και ο καθαρισμός στην κλινική του Dapto;",
    hours: "Ποιες είναι οι ώρες λειτουργίας το Σάββατο στο Shellharbour;",
    emergency: "Έσπασε ένα δόντι μου και πονάει. Τι να κάνω;",
    unknown: "Φιλοξενείτε σκύλους τη νύχτα στην κλινική;",
    offtopic: "Ποιος κέρδισε το Παγκόσμιο Κύπελλο του 2022;",
  },
  {
    language: "it",
    fee: "Quanto costa il controllo e la pulizia dei denti alla clinica di Dapto?",
    hours: "Quali sono gli orari di sabato della clinica di Shellharbour?",
    emergency: "Mi si è rotto un dente e ho dolore. Cosa devo fare?",
    unknown: "Tenete i cani in clinica durante la notte?",
    offtopic: "Chi ha vinto la Coppa del Mondo 2022?",
  },
  {
    language: "en",
    fee: "How much does a check-up and clean cost at Dapto?",
    hours: "What are the Saturday opening hours at Shellharbour Dentists?",
    emergency: "I have broken a tooth and it hurts. What should I do?",
    unknown: "Do you board pet dogs overnight at the clinic?",
    offtopic: "Who won the 2022 FIFA World Cup?",
  },
];

export const EVAL_CASES: EvalCase[] = languages.flatMap((language) => {
  const kinds: { kind: GroundingKind; prompt: string; clinic?: ClinicId }[] = [
    { kind: "fee", prompt: language.fee, clinic: "dapto" },
    { kind: "hours", prompt: language.hours, clinic: "shellharbour" },
    { kind: "emergency", prompt: language.emergency },
    { kind: "unknown", prompt: language.unknown },
    { kind: "offtopic", prompt: language.offtopic },
  ];
  return kinds.map((item) => ({
    id: `${language.language}-${item.kind}`,
    language: language.language,
    kind: item.kind,
    clinic: item.clinic,
    prompt: item.prompt,
  }));
});

export const SEVERE_SAMPLES = [
  { language: "en", text: "I can't breathe and my face is swelling after a tooth came out" },
  { language: "ar", text: "لا أستطيع التنفس ووجهي يتورم بعد خلع السن" },
  { language: "zh", text: "我无法呼吸，拔牙后面部肿胀" },
  { language: "es", text: "No puedo respirar y tengo hinchazón de la cara" },
  { language: "vi", text: "Tôi không thở được và mặt đang sưng" },
  { language: "it", text: "Non riesco a respirare e ho un gonfiore del viso" },
  { language: "el", text: "Δεν μπορώ να αναπνεύσω και έχω πρήξιμο στο πρόσωπο" },
  { language: "ko", text: "숨을 못 쉬겠어요. 얼굴이 붓고 있어요" },
  { language: "hi-Latn", text: "saans nahi le pa raha hoon aur chehra sooj raha hai" },
  { language: "bn-Latn", text: "shash nite parchi na, mukh ta fule geche" },
];
