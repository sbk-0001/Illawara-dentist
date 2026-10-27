import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clinicFocus } from "../intent";
import type { KnowledgeIndex } from "../types";
import { fuseRetrieval, searchByVectors, searchIndex, sourcesFromChunks } from "./search";
import type { KnowledgeChunk } from "../types";

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

  it("retrieves implants, Invisalign and children's dentistry for non-Latin questions", () => {
    const implants = searchIndex(index, "هل تقدمون زراعة الأسنان؟", 6);
    expect(implants.some((hit) => /implant/i.test(`${hit.title} ${hit.heading}`))).toBe(true);
    const aligners = searchIndex(index, "你们提供隐适美矫正吗？", 6);
    expect(aligners.some((hit) => /invisalign/i.test(`${hit.title} ${hit.heading} ${hit.text}`))).toBe(true);
    const kids = searchIndex(index, "Κάνετε παιδοδοντιατρική για παιδιά;", 6);
    expect(kids.some((hit) => /kid|child|paediatr/i.test(`${hit.title} ${hit.heading}`))).toBe(true);
  });

  it("keeps an embedding hit that shares no words with the question", () => {
    const chunks: KnowledgeChunk[] = [
      {
        id: "fees",
        clinic: "dapto",
        url: "https://daptodentists.com.au/our-fees",
        title: "Our Fees",
        heading: "Fees",
        text: "Check-up and clean fees at Dapto are listed on this page for new patients today.",
      },
      {
        id: "implants",
        clinic: "shellharbour",
        url: "https://shellharbourdentist.com.au/dental-implants/",
        title: "Dental Implants",
        heading: "Implants",
        text: "Dental implants replace a missing tooth and are offered at the Shellharbour clinic.",
      },
    ];
    const tiny: KnowledgeIndex = { ...fixture, chunkCount: 2, chunks };
    const semantic = searchByVectors(tiny, "هل تقدمون زراعة الأسنان؟", [0, 1], new Float32Array([1, 0, 0, 1]), 2, 2);
    expect(semantic[0]?.id).toBe("implants");
    const fused = fuseRetrieval([], semantic, 4);
    expect(fused.map((hit) => hit.id)).toContain("implants");
    const union = fuseRetrieval(
      [{ ...chunks[0], score: 3 }],
      semantic,
      4,
    );
    expect(union.map((hit) => hit.id).sort()).toEqual(["fees", "implants"]);
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
