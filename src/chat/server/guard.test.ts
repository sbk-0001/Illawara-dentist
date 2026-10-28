import { afterEach, describe, expect, it } from "vitest";
import { originAllowed, resetRateLimits, takeRateLimit } from "./guard";

afterEach(() => resetRateLimits());

describe("origin checks", () => {
  it("allows same-host, localhost and an explicit allowlist", () => {
    expect(originAllowed(null, "preview.example.com", [])).toBe(true);
    expect(originAllowed("https://preview.example.com", "preview.example.com", [])).toBe(true);
    expect(originAllowed("http://localhost:3000", "localhost:3000", [])).toBe(true);
    expect(originAllowed("https://daptodentists.com.au", "chat.example.com", ["https://daptodentists.com.au"])).toBe(true);
  });

  it("rejects a foreign website", () => {
    expect(originAllowed("https://evil.example", "chat.example.com", [])).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks once the window is full", () => {
    expect(takeRateLimit("chat:1", 2, 60_000, 1_000)).toBe(true);
    expect(takeRateLimit("chat:1", 2, 60_000, 1_100)).toBe(true);
    expect(takeRateLimit("chat:1", 2, 60_000, 1_200)).toBe(false);
    expect(takeRateLimit("chat:1", 2, 60_000, 62_000)).toBe(true);
  });
});
