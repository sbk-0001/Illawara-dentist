import { describe, expect, it } from "vitest";
import { dedupeSourceChips } from "./sources";

describe("source chips", () => {
  it("drops a repeated url or title", () => {
    const chips = dedupeSourceChips([
      { title: "Our Fees", url: "https://daptodentists.com.au/fees/" },
      { title: "Fees again", url: "https://daptodentists.com.au/fees" },
      { title: "Our Fees", url: "https://woononadentists.com.au/fees" },
      { title: "Contact", url: "https://woononadentists.com.au/contact-us/" },
    ]);
    expect(chips).toEqual([
      { title: "Our Fees", url: "https://daptodentists.com.au/fees/" },
      { title: "Contact", url: "https://woononadentists.com.au/contact-us/" },
    ]);
  });
});