import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clinicFocus } from "../intent";
import type { KnowledgeIndex } from "../types";
import { searchIndex, sourcesFromChunks } from "./search";

const index = JSON.parse(readFileSync(path.join(process.cwd(), "src/chat/data/knowledge-index.json"), "utf8")) as KnowledgeIndex;

const fixture: KnowledgeIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  note: "fixture",
  pageCounts: { dapto: 1, shellharbour: 1, woonona: 1 },
  chunkCount: 3,
  contacts: index.contacts,
  pages: [],
  chunks: [
    {
      id: "d1",
      clinic: "dapto",
      url: "https://daptodentists.com.au/our-fees",
      title: "Our Fees",
      heading: "Check-up",
      text: "A check-up and clean at Dapto is listed from $199 for new patients. Health funds can be claimed with HICAPS.",
    },
    {
      id: "s1",
      clinic: "shellharbour",
      url: "https://shellharbourdentist.com.au/contact-shellharbour-dentists-visit-or-call-us-today/",
      title: "Contact Shellharbour Dentists",
      heading: "Hours",
      text: "Shellharbour Dentists are open Monday to Friday 8.00 AM to 5.00 PM. Saturday is by appointment only at Barrack Heights.",
    },
    {
      id: "w1",
      clinic: "woonona",
      url: "https://woononadentists.com.au/payment-plans/",
      title: "Payment Plans",
      heading: "Afterpay",
      text: "Woonona Dentists offers Afterpay and health fund claims on the spot at 379 Princes Highway.",
    },
  ],
};

describe("retrieval", () => {
  it("returns the Dapto fee page ahead of the other clinics", () => {
    const hits = searchIndex(fixture, "How much is a check-up and clean at Dapto?", 3);
    expect(hits[0]?.clinic).toBe("dapto");
    expect(hits[0]?.title).toBe("Our Fees");
    expect(sourcesFromChunks(hits)[0]?.url).toContain("daptodentists.com.au");
  });

  it("asks which clinic when hours are requested without a location", () => {
    expect(clinicFocus("What time do you open on Saturday?")).toEqual({ kind: "ask" });
    expect(clinicFocus("Saturday hours at Shellharbour")).toEqual({ kind: "one", clinic: "shellharbour" });
    expect(clinicFocus("parking at Barrack Heights")).toEqual({ kind: "one", clinic: "shellharbour" });
  });

  it("finds real Saturday-hours context for Shellharbour in the crawled index", () => {
    const hits = searchIndex(index, "What are the Saturday opening hours at Shellharbour Dentists?", 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.clinic === "shellharbour")).toBe(true);
    for (const hit of hits) {
      expect(hit.title).not.toMatch(/^[a-z0-9-]+$/);
      expect(hit.url.startsWith("https://")).toBe(true);
    }
  });

  it("finds fee or payment context for Dapto", () => {
    const hits = searchIndex(index, "How much does a check-up and clean cost at Dapto? payment health fund", 4);
    expect(hits.some((hit) => hit.clinic === "dapto")).toBe(true);
    expect(hits.some((hit) => /fee|payment|fund|price|cost|hicap|afterpay/i.test(`${hit.title} ${hit.text}`))).toBe(true);
  });
});

describe("committed index", () => {
  it("has pages, contacts and booking links for all three clinics", () => {
    for (const clinic of ["dapto", "shellharbour", "woonona"] as const) {
      expect(index.pageCounts[clinic]).toBeGreaterThan(15);
      const contact = index.contacts[clinic];
      expect(contact.phoneDigits).toMatch(/^0\d{9}$/);
      expect(contact.phoneDigits).not.toBe("0242105301");
      expect(contact.email).toContain("@");
      expect(contact.bookingUrl).toContain("https://bookings.zavy360.com/");
      expect(contact.address).toMatch(/NSW/);
      expect(contact.address).not.toMatch(/\bAM\b/);
      expect(contact.hours.toLowerCase()).toMatch(/mon/);
    }
    expect(JSON.stringify(index)).not.toContain("4210 5301");
  });
});
