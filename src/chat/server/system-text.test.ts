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
