import { describe, expect, it } from "vitest";
import { splitIsolatedEmbeds } from "./bidi";

describe("bidi isolates", () => {
  it("wraps phone numbers, emails and urls so RTL text cannot reverse them", () => {
    const parts = splitIsolatedEmbeds(
      "اتصلوا على 02 4216 9911 أو info@shellharbourdentist.com.au عبر https://bookings.zavy360.com/booking/shellharbourdentists/locations/abc",
    );
    const isolated = parts.filter((part) => part.kind === "isolate").map((part) => part.value);
    expect(isolated).toContain("02 4216 9911");
    expect(isolated).toContain("info@shellharbourdentist.com.au");
    expect(isolated.some((value) => value.startsWith("https://bookings.zavy360.com/"))).toBe(true);
    expect(parts[0]).toMatchObject({ kind: "text" });
    expect(parts.some((part) => part.kind === "text" && part.value.includes("اتصلوا"))).toBe(true);
  });
});
