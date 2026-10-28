import { describe, expect, it } from "vitest";
import { replyScriptConflicts } from "../language/reply-script";
import { FEE_CAVEAT_EN, createSystemTextFilter, localizeSystemEnglish, stripFeeCaveat, tryAgainMessage } from "./system-text";

const ENGLISH =
  "Teeth whitening is available. Fees, private health benefits and third-party payment arrangements vary. Please confirm current details before relying on an option.";

describe("localized system text", () => {
  it("finds the English fee sentence in page text and rewrites it for Bengali", () => {
    expect(stripFeeCaveat(`Whitening. ${FEE_CAVEAT_EN}`)).not.toContain("third-party payment");
    expect(stripFeeCaveat(`Whitening. ${FEE_CAVEAT_EN}`)).toContain("Whitening.");
    const bengali = localizeSystemEnglish(ENGLISH, "bn");
    expect(bengali).not.toContain(FEE_CAVEAT_EN);
    expect(bengali).toContain("ফি");
    expect(localizeSystemEnglish(ENGLISH, "en")).toContain(FEE_CAVEAT_EN);
    expect(replyScriptConflicts(ENGLISH, "bn")).toBe(true);
    expect(replyScriptConflicts("হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে।", "bn")).toBe(false);
    expect(replyScriptConflicts("02 4284 4486", "ko")).toBe(false);
    expect(replyScriptConflicts("হ্যাঁ, Dapto Dentists-এ দাঁত সাদা করার চিকিৎসা আছে। বিস্তারিত জানতে ক্লিনিকে ফোন করুন।", "bn")).toBe(false);
    expect(
      replyScriptConflicts("পেজে teeth whitening এবং professional teeth whitening সম্পর্কে বলা আছে। আরও বিস্তারিত নেই।", "bn"),
    ).toBe(true);
    expect(
      replyScriptConflicts("হ্যাঁ, same day emergency appointment slots আছে। আরও বিস্তারিত জানতে ক্লিনিকে ফোন করুন আজই।", "bn"),
    ).toBe(true);
    expect(replyScriptConflicts("হ্যাঁ, whitening options assessment-এর পরে ক্লিনিকে ফোন করুন আজ।", "bn")).toBe(true);
    expect(replyScriptConflicts("হ্যাঁ, whitening options assessmentএর পরে ক্লিনিকে ফোন করুন আজ।", "bn")).toBe(true);
    expect(replyScriptConflicts("urgent dental concern के लिए आज क्लिनिक में आएँ और फ़ोन करें।", "hi")).toBe(true);
    expect(replyScriptConflicts("urgent dental concernके लिए आज क्लिनिक में आएँ और फ़ोन करें।", "hi")).toBe(true);
    expect(replyScriptConflicts("urgent medical help के लिए तुरंत क्लिनिक को फ़ोन करें आज।", "hi")).toBe(true);
    expect(replyScriptConflicts("Please call the clinic for an urgent dental appointment today.", "hi")).toBe(true);
    expect(
      replyScriptConflicts(
        "Dapto Dentists में urgent dental समस्या है। दाँत में तेज़ दर्द हो रहा है, तो क्लिनिक को फ़ोन करें।",
        "hi",
      ),
    ).toBe(false);
  });

  it("localizes a fee sentence split across deltas and gives a Bengali try-again line", () => {
    const filter = createSystemTextFilter("bn");
    const lead = filter.push("হ্যাঁ, দাঁত সাদা করার চিকিৎসা আছে। ");
    const mid = filter.push("Fees, private health benefits and ");
    const rest = filter.push("third-party payment arrangements vary. Please confirm current details before relying on an option.");
    expect(`${lead}${mid}${rest}${filter.flush()}`).not.toContain(FEE_CAVEAT_EN);
    expect(`${lead}${mid}${rest}`).toContain("ফি");
    expect(tryAgainMessage("bn", [{ name: "Dapto Dentists", phone: "02 4288 0737" }])).toContain("আবার চেষ্টা করুন");
    expect(tryAgainMessage("zh", [])).toContain("请再试一次");
  });
});
