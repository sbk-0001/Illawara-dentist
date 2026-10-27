/**
 * Deterministic script cleanup for replies that must stay in one writing system.
 * Banglish/Hinglish: transliterate any Bengali or Devanagari that slips in.
 * Simplified Chinese: map a short list of common traditional characters. Not a full converter.
 */

const BN_INDEPENDENT: Record<string, string> = {
  অ: "o",
  আ: "a",
  ই: "i",
  ঈ: "i",
  উ: "u",
  ঊ: "u",
  ঋ: "ri",
  এ: "e",
  ঐ: "oi",
  ও: "o",
  ঔ: "ou",
};

const BN_CONSONANT: Record<string, string> = {
  ক: "k",
  খ: "kh",
  গ: "g",
  ঘ: "gh",
  ঙ: "ng",
  চ: "ch",
  ছ: "chh",
  জ: "j",
  ঝ: "jh",
  ঞ: "n",
  ট: "t",
  ঠ: "th",
  ড: "d",
  ঢ: "dh",
  ণ: "n",
  ত: "t",
  থ: "th",
  দ: "d",
  ধ: "dh",
  ন: "n",
  প: "p",
  ফ: "f",
  ব: "b",
  ভ: "bh",
  ম: "m",
  য: "j",
  র: "r",
  ল: "l",
  শ: "sh",
  ষ: "sh",
  স: "s",
  হ: "h",
  ড়: "r",
  ঢ়: "rh",
  য়: "y",
  ৎ: "t",
};

const BN_VOWEL: Record<string, string> = {
  "া": "a",
  "ি": "i",
  "ী": "i",
  "ু": "u",
  "ূ": "u",
  "ৃ": "ri",
  "ে": "e",
  "ৈ": "oi",
  "ো": "o",
  "ৌ": "ou",
};

const HI_INDEPENDENT: Record<string, string> = {
  अ: "a",
  आ: "a",
  इ: "i",
  ई: "i",
  उ: "u",
  ऊ: "u",
  ऋ: "ri",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
};

const HI_CONSONANT: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "ng",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "n",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
};

const HI_VOWEL: Record<string, string> = {
  "ा": "a",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "u",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
};

const BN_VIRAMA = "্";
const HI_VIRAMA = "्";

/** Common traditional forms that show up as strays in simplified replies. */
const TRAD_TO_SIMP: Record<string, string> = {
  製: "制",
  國: "国",
  門: "门",
  開: "开",
  時: "时",
  間: "间",
  會: "会",
  對: "对",
  說: "说",
  這: "这",
  個: "个",
  來: "来",
  東: "东",
  車: "车",
  長: "长",
  醫: "医",
  療: "疗",
  齒: "齿",
  價: "价",
  錢: "钱",
  週: "周",
  點: "点",
  鐘: "钟",
  與: "与",
  為: "为",
  從: "从",
  後: "后",
  發: "发",
  現: "现",
  書: "书",
  學: "学",
  電: "电",
  視: "视",
  網: "网",
  線: "线",
  務: "务",
  業: "业",
  診: "诊",
  問: "问",
  題: "题",
  應: "应",
  該: "该",
  還: "还",
  裡: "里",
  麼: "么",
  樣: "样",
  過: "过",
  進: "进",
  關: "关",
  於: "于",
  請: "请",
  謝: "谢",
  號: "号",
  機: "机",
  話: "话",
  語: "语",
  體: "体",
  員: "员",
  兒: "儿",
  兩: "两",
  無: "无",
};

function transliterate(
  text: string,
  consonants: Record<string, string>,
  vowels: Record<string, string>,
  independent: Record<string, string>,
  virama: string,
  inherent: string,
  marks: Record<string, string>,
): string {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] || "";
    if (marks[ch]) {
      out += marks[ch];
      continue;
    }
    if (independent[ch]) {
      out += independent[ch];
      continue;
    }
    const base = consonants[ch];
    if (!base) {
      out += vowels[ch] || ch;
      continue;
    }
    const next = chars[i + 1];
    if (next === virama) {
      i += 1;
      out += base;
      continue;
    }
    if (next && vowels[next]) {
      i += 1;
      out += base + vowels[next];
      continue;
    }
    out += base + inherent;
  }
  return out;
}

export function transliterateBengali(text: string): string {
  return transliterate(text, BN_CONSONANT, BN_VOWEL, BN_INDEPENDENT, BN_VIRAMA, "o", { "ং": "ng", "ঃ": "h", "ঁ": "n" });
}

export function transliterateDevanagari(text: string): string {
  return transliterate(text, HI_CONSONANT, HI_VOWEL, HI_INDEPENDENT, HI_VIRAMA, "a", { "ं": "n", "ः": "h", "ँ": "n" });
}

export function visitorUsesTraditional(text: string): boolean {
  return [...text].some((ch) => TRAD_TO_SIMP[ch]);
}

export function toSimplified(text: string): string {
  return [...text].map((ch) => TRAD_TO_SIMP[ch] || ch).join("");
}

const DEVA_START = 0x0900;
const BENG_START = 0x0980;
const INDIC_BLOCK = 0x80;

/** Bengali and Devanagari share a layout. 0x0980 maps onto 0x0900. */
function mapIndicBlock(text: string, from: number, to: number): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < from || code >= from + INDIC_BLOCK) {
      out += ch;
      continue;
    }
    const mapped = String.fromCodePoint(code - from + to);
    out += /\p{L}|\p{M}/u.test(mapped) ? mapped : ch;
  }
  return out;
}

/** Stray Bengali letters inside a Devanagari reply, for example सাদা → सादा. */
export function bengaliToDevanagari(text: string): string {
  return mapIndicBlock(text, BENG_START, DEVA_START);
}

/** Stray Devanagari letters inside a Bengali reply. */
export function devanagariToBengali(text: string): string {
  return mapIndicBlock(text, DEVA_START, BENG_START);
}

/** Fix a finished reply. `visitorText` decides whether a Chinese reply should stay traditional. */
export function fixReplyScript(text: string, code: string, visitorText = ""): string {
  if (code === "bn-Latn") return transliterateBengali(text);
  if (code === "hi-Latn") return transliterateDevanagari(text);
  if (code === "hi") return bengaliToDevanagari(text);
  if (code === "bn") return devanagariToBengali(text);
  if (code === "zh" && !visitorUsesTraditional(visitorText)) return toSimplified(text);
  return text;
}

function holdsCluster(ch: string, code: string): boolean {
  if (code === "bn-Latn") return Boolean(BN_CONSONANT[ch]) || ch === BN_VIRAMA;
  if (code === "hi-Latn") return Boolean(HI_CONSONANT[ch]) || ch === HI_VIRAMA;
  return false;
}

/** Streaming helper. Latin text passes through; a trailing consonant waits for a vowel sign. */
export function createScriptBuffer(code: string, visitorText = "") {
  let hold = "";
  const active = code === "bn-Latn" || code === "hi-Latn" || code === "bn" || code === "hi" || (code === "zh" && !visitorUsesTraditional(visitorText));
  return {
    push(delta: string): string {
      if (!active) return delta;
      const chars = [...(hold + delta)];
      hold = "";
      if (code === "bn-Latn" || code === "hi-Latn") {
        const last = chars[chars.length - 1];
        if (last && holdsCluster(last, code)) {
          hold = last;
          chars.pop();
        }
      }
      return fixReplyScript(chars.join(""), code, visitorText);
    },
    flush(): string {
      const rest = hold;
      hold = "";
      return rest ? fixReplyScript(rest, code, visitorText) : "";
    },
  };
}

type ScriptChunk = { type: string; id?: string; delta?: string };

export function attachScriptFix<T extends ScriptChunk>(stream: ReadableStream<T>, code: string, visitorText: string): ReadableStream<T> {
  const buffer = createScriptBuffer(code, visitorText);
  let textId: string | undefined;
  let flushed = false;
  const flush = (controller: TransformStreamDefaultController<T>) => {
    if (flushed) return;
    flushed = true;
    const rest = buffer.flush();
    if (!rest) return;
    if (!textId) {
      textId = "script";
      controller.enqueue({ type: "text-start", id: textId } as T);
    }
    controller.enqueue({ type: "text-delta", id: textId, delta: rest } as T);
  };
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (chunk.type === "text-start" && chunk.id) textId = chunk.id;
        if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
          const delta = buffer.push(chunk.delta);
          if (!delta) return;
          const id = chunk.id || textId;
          if (!id) {
            textId = "script";
            controller.enqueue({ type: "text-start", id: textId } as T);
            controller.enqueue({ type: "text-delta", id: textId, delta } as T);
            return;
          }
          controller.enqueue({ ...chunk, id, delta });
          return;
        }
        if (chunk.type === "text-end" || chunk.type === "finish") {
          flush(controller);
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        flush(controller);
      },
    }),
  );
}
