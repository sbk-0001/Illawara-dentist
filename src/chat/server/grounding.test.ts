import { describe, expect, it } from "vitest";
import type { KnowledgeIndex } from "../types";
import { checkGrounding } from "./grounding";

const index = {
  version: 1,
  generatedAt: "",
  note: "",
  pageCounts: { dapto: 1, shellharbour: 1, woonona: 1 },
  chunkCount: 1,
  pages: [],
  contacts: {
    dapto: {
      clinic: "dapto",
      name: "Dapto Dentists",
      site: "https://daptodentists.com.au/",
      phone: "02 4288 0737",
      phoneDigits: "0242880737",
      otherPhones: [],
      email: "info@daptodentists.com.au",
      bookingUrl: "https://bookings.zavy360.com/booking/example",
      address: "35 Baan Baan Street, Dapto NSW 2530",
      hours: "Monday–Friday 08:00–18:00; Saturday 08:00–16:00",
    },
    shellharbour: {
      clinic: "shellharbour",
      name: "Shellharbour Dentists",
      site: "https://shellharbourdentist.com.au/",
      phone: "02 4216 9911",
      phoneDigits: "0242169911",
      otherPhones: [],
      email: "info@shellharbourdentist.com.au",
      bookingUrl: "https://bookings.zavy360.com/booking/shell",
      address: "Suite 7, Barrack Heights NSW 2528",
      hours: "Monday – Friday 8.00 AM – 5.00 PM Saturday Appointment only",
    },
    woonona: {
      clinic: "woonona",
      name: "Woonona Dentists",
      site: "https://woononadentists.com.au/",
      phone: "02 4284 4486",
      phoneDigits: "0242844486",
      otherPhones: [],
      email: "info@woononadentists.com.au",
      bookingUrl: "https://bookings.zavy360.com/booking/woonona",
      address: "379 Princes Highway Woonona NSW 2517",
      hours: "Monday – Friday 8.00 AM – 6.00 PM Saturday 8 AM – 5 PM",
    },
  },
  chunks: [
    {
      id: "fee",
      clinic: "dapto",
      url: "https://daptodentists.com.au/our-fees",
      title: "Our Fees",
      heading: "Check-up",
      text: "Check-up and clean from $199.",
    },
  ],
} satisfies KnowledgeIndex;

describe("grounding", () => {
  it("accepts a price and phone that are in the index", () => {
    const result = checkGrounding("A check-up is from $199. Call 02 4288 0737.", index, "fee", "dapto");
    expect(result.ok).toBe(true);
  });

  it("rejects an invented price, the mock phone, and a diagnosis", () => {
    const result = checkGrounding("It costs $50. Call 02 4210 5301. You should take ibuprofen.", index, "fee");
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/\$50|4210 5301|ibuprofen/);
  });

  it("requires a real contact route when the index has no answer", () => {
    expect(checkGrounding("I don't know.", index, "unknown").ok).toBe(false);
    expect(checkGrounding("I don't have that. Email info@daptodentists.com.au.", index, "unknown").ok).toBe(true);
  });

  it("rejects a Saturday time that the Shellharbour pages do not publish", () => {
    const result = checkGrounding("Shellharbour is open Saturday at 11am.", index, "hours", "shellharbour");
    expect(result.ok).toBe(false);
  });
});
