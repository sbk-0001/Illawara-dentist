/**
 * Malayalam and Tamil share sounds. Deepgram and an unconstrained
 * transcription often write Malayalam with Tamil letters, or as Latin
 * Manglish. These markers are the lexical half of the Auto judge.
 */

const ML_LATIN =
  /\b(?:klinikinde|vilasem|vilasam|endan|endal|ethra|entha|entaan|entān|entāṇ|kittumo|pattumo|inde)\b/gi;
const TA_LATIN = /\b(?:venum|enna|evvalavu|eppo|oda)\b/gi;

/**
 * Malayalam words, including the ones Deepgram spells with Tamil letters.
 * உண்டோ covers ചെയ്യാറുണ്ടോ written as செய்யாருண்டோ or செய்யாறுண்டோ.
 */
const ML_SCRIPT =
  /ഉണ്ട്|എന്താണ്|ആണോ|ഇന്ന്|പറ്റുമോ|കിട്ടുമോ|എത്ര|உண்டு|உண்டோ|றுண்டோ|ருந்தோ|கிட்டுமோ|க்கிட்டு|எத்ர|செய்யாருண்டோ|செய்யாறுண்டோ|செய்யாருந்தோ|வெளுப்பிக்கல்|வெளுப்பிக்கில்|சனியாய்ச்ச|சனியார்ச்ச|எப்போல்|எப்போள்|துறக்கும்|இனிக்கி|எனிக்கு/g;
/** "ഇന്ന്" written as இன்ன, but not the Tamil இன்னைக்கு. */
const ML_INNA = /(^|[^\u0B80-\u0BFF])இன்ன(?!ை)/g;
const TA_SCRIPT = /என்ன|இருக்கா|வேணும்|எப்போ(?![ல்ள])|உடைய|கிடைக்குமா|எப்படி/g;

function hits(text: string, re: RegExp): number {
  return text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))?.length ?? 0;
}

export function markerScore(text: string, language: "ml" | "ta"): number {
  if (!text) return 0;
  if (language === "ml") return hits(text, ML_LATIN) + hits(text, ML_SCRIPT) + hits(text, ML_INNA);
  return hits(text, TA_LATIN) + hits(text, TA_SCRIPT);
}

/** Malayalam markers outnumber Tamil markers. One clear marker is enough. */
export function malayalamMarkersWin(text: string): boolean {
  const ml = markerScore(text, "ml");
  return ml > 0 && ml > markerScore(text, "ta");
}

export function tamilMarkersWin(text: string): boolean {
  const ta = markerScore(text, "ta");
  return ta > 0 && ta > markerScore(text, "ml");
}

function hasMalayalamScript(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text);
}

function hasTamilScript(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

export type IndicChoice = {
  language: "ml" | "ta" | null;
  transcript: string;
  /** The winning transcript is not yet in that language's script. */
  needsScript: boolean;
};

/**
 * Pick ml or ta from the Deepgram final plus the two forced transcriptions.
 * A Tamil-letter transcription of Malayalam (உண்டு, இன்ன, கிட்டுமோ) stays Malayalam.
 * The returned transcript is the pass for that language when it exists.
 */
export function judgeIndicPair(input: { deepgram: string; malayalam: string | null; tamil: string | null }): IndicChoice {
  const deepgram = input.deepgram || "";
  const mlText = (input.malayalam || "").trim();
  const taText = (input.tamil || "").trim();
  const mlNative = hasMalayalamScript(mlText);
  const taNative = hasTamilScript(taText) && !malayalamMarkersWin(taText);
  let language: "ml" | "ta" | null = null;
  if (malayalamMarkersWin(deepgram) || malayalamMarkersWin(mlText)) language = "ml";
  else if (hasTamilScript(deepgram) && !malayalamMarkersWin(deepgram)) language = "ta";
  else if (mlNative && markerScore(mlText, "ml") >= markerScore(taText, "ta")) language = "ml";
  else if (taNative && tamilMarkersWin(taText)) language = "ta";
  else if (mlNative) language = "ml";
  else if (taNative) language = "ta";

  if (!language) return { language: null, transcript: deepgram, needsScript: false };
  const preferred = (language === "ml" ? mlText : taText) || deepgram;
  const needsScript = language === "ml" ? !hasMalayalamScript(preferred) : !hasTamilScript(preferred);
  return { language, transcript: preferred, needsScript };
}
