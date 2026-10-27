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

  it("puts a space between surrounding text and an isolated phone, email or url", () => {
    const parts = splitIsolatedEmbeds("اتصلوا على02 4216 9911أو info@shellharbourdentist.com.auثم https://bookings.zavy360.com/booking/x");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || part.kind !== "isolate") continue;
      const prev = parts[i - 1];
      const next = parts[i + 1];
      if (prev?.kind === "text") expect(prev.value.endsWith(" "), part.value).toBe(true);
      if (next?.kind === "text") expect(next.value.startsWith(" "), part.value).toBe(true);
    }
    expect(parts.filter((part) => part.kind === "isolate").map((part) => part.value)).toEqual([
      "02 4216 9911",
      "info@shellharbourdentist.com.au",
      "https://bookings.zavy360.com/booking/x",
    ]);
  });
});
