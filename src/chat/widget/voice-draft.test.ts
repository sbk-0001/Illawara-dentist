import { describe, expect, it } from "vitest";
import { voiceDraftStillApplies } from "./voice-draft";

const bengali = { transcript: "Woonona kliniker চিkanaki." };
const spanish = { transcript: "¿A qué hora abre la clínica de Dapto el sábado?" };

describe("voice draft bound to the transcript", () => {
  it("keeps the spoken language through a small edit and drops a fresh sentence", () => {
    expect(voiceDraftStillApplies(bengali, bengali.transcript)).toBe(true);
    expect(voiceDraftStillApplies(bengali, "Woonona kliniker চিkanaki")).toBe(true);
    expect(voiceDraftStillApplies(spanish, "¿A qué hora abre la clínica de Dapto el sabado?")).toBe(true);
    expect(voiceDraftStillApplies(spanish, "What is the parking like?")).toBe(false);
    expect(voiceDraftStillApplies(bengali, "")).toBe(false);
    expect(voiceDraftStillApplies({ transcript: "" }, "hello")).toBe(false);
  });
});
