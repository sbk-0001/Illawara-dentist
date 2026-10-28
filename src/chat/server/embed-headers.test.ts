import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy, isIllawarraWebsitePreview, PROJECT_PREVIEW_SOURCE } from "./embed-headers";
import { proxy } from "../../proxy";

const PREVIEW = "https://illawarra-dentists-website-git-faq-ridwankhalid.vercel.app";

afterEach(() => {
  delete process.env.CHAT_ALLOWED_ORIGINS;
});

describe("embed framing headers", () => {
  it("frames /embed only for the allowlist and this project's vercel.app previews", () => {
    const policy = contentSecurityPolicy("/embed", "https://daptodentists.com.au, https://shellharbourdentist.com.au/", PREVIEW);
    expect(policy.startsWith("frame-ancestors ")).toBe(true);
    expect(policy).toContain("'self'");
    expect(policy).toContain("https://daptodentists.com.au");
    expect(policy).toContain("https://shellharbourdentist.com.au");
    expect(policy).toContain(PREVIEW);
    expect(policy).toContain(PROJECT_PREVIEW_SOURCE);
    expect(policy).toContain("https://woononadentists.com.au");
    expect(policy).toContain("http://localhost:*");
    expect(policy).toContain("https://illawarra-dentists-website-git-faq-chat-embed-strategybyte.vercel.app");
    expect(policy).not.toMatch(/frame-ancestors \*/);
  });

  it("does not add a vercel.app host from a different project", () => {
    const policy = contentSecurityPolicy("/embed", "", "https://other-clinic.vercel.app");
    expect(policy).not.toContain("other-clinic.vercel.app");
    expect(policy).toContain(PROJECT_PREVIEW_SOURCE);
    expect(isIllawarraWebsitePreview("https://illawarra-dentists-website.vercel.app")).toBe(true);
    expect(isIllawarraWebsitePreview("https://illawarra-dentists-website-abc123-team.vercel.app")).toBe(true);
    expect(isIllawarraWebsitePreview("https://other-clinic.vercel.app")).toBe(false);
    expect(isIllawarraWebsitePreview("https://illawarra-dentists-website.vercel.app.evil.com")).toBe(false);
    expect(isIllawarraWebsitePreview("http://illawarra-dentists-website.vercel.app")).toBe(false);
  });

  it("drops allowlist values that are not a bare origin", () => {
    const policy = contentSecurityPolicy("/embed", "https://ok.example, *, https://evil.example/path, https://*.vercel.app, not a url");
    expect(policy).toContain("https://ok.example");
    expect(policy).not.toContain("https://evil.example/path");
    expect(policy).not.toContain("not a url");
    expect(policy.match(/https:\/\/\*\.vercel\.app/g)?.length).toBe(1);
  });

  it("refuses to frame the homepage and the chat API", () => {
    expect(contentSecurityPolicy("/", "https://daptodentists.com.au")).toBe("frame-ancestors 'none'");
    expect(contentSecurityPolicy("/api/chat", "https://daptodentists.com.au")).toBe("frame-ancestors 'none'");
    expect(contentSecurityPolicy("/api/chat/transcribe", "")).toBe("frame-ancestors 'none'");
  });

  it("sets that policy from the proxy, including a preview referrer", () => {
    process.env.CHAT_ALLOWED_ORIGINS = "https://daptodentists.com.au";
    const embed = proxy(
      new NextRequest("https://chat.example.com/embed?inline=1", { headers: { referer: `${PREVIEW}/` } }),
    );
    const header = embed.headers.get("content-security-policy") ?? "";
    expect(header).toContain("https://daptodentists.com.au");
    expect(header).toContain(PREVIEW);
    expect(header).toContain(PROJECT_PREVIEW_SOURCE);
    expect(proxy(new NextRequest("https://chat.example.com/")).headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(proxy(new NextRequest("https://chat.example.com/api/chat")).headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
  });
});
