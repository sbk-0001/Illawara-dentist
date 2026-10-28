// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

const source = readFileSync(path.join(process.cwd(), "public/embed.js"), "utf8").replace(
  "document.currentScript",
  "currentScript",
);

function run(attributes: Record<string, string>, html = "<div id='chat-slot'></div>") {
  document.body.innerHTML = html;
  const script = document.createElement("script");
  script.src = "https://chat.example.com/embed.js?v=1";
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
  document.body.appendChild(script);
  const execute = new Function("currentScript", source);
  execute(script);
}

function frame(): HTMLIFrameElement {
  const iframe = document.getElementById("illawarra-chat-frame");
  if (!(iframe instanceof HTMLIFrameElement)) throw new Error("missing chat frame");
  return iframe;
}

beforeEach(() => {
  window.innerWidth = 1024;
  window.innerHeight = 800;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 640px") && window.innerWidth <= 640,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
});

describe("embed.js", () => {
  it("mounts an inline iframe into the target", () => {
    run({ "data-mode": "inline", "data-target": "#chat-slot" });
    const iframe = document.querySelector("#chat-slot iframe");
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    const frameEl = iframe as HTMLIFrameElement;
    expect(frameEl.src).toBe("https://chat.example.com/embed?inline=1");
    expect(frameEl.getAttribute("allow")).toBe("microphone");
    expect(frameEl.title).toBe("Illawarra Dentists chat");
    expect(frameEl.getAttribute("loading")).toBe("lazy");
    expect(frameEl.style.minHeight).toBe("640px");
    expect(document.querySelector("button")).toBeNull();
  });

  it("floats a launcher and an open iframe, and ignores a foreign origin", () => {
    run({ "data-mode": "floating" });
    const launcher = document.querySelector("button");
    expect(launcher?.textContent).toBe("Ask the clinics");
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
    const iframe = frame();
    expect(iframe.src).toBe("https://chat.example.com/embed?open=1");
    expect(iframe.getAttribute("allow")).toBe("microphone");
    expect(iframe.title).toBe("Illawarra Dentists chat");
    expect(iframe.getAttribute("loading")).toBe("lazy");
    expect(iframe.style.display).toBe("none");

    launcher?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(iframe.style.display).toBe("block");
    expect(launcher?.getAttribute("aria-expanded")).toBe("true");
    expect(iframe.style.width).toContain("400px");

    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { source: "illawarra-chat", type: "close" } }));
    expect(iframe.style.display).toBe("block");

    window.dispatchEvent(
      new MessageEvent("message", { origin: "https://chat.example.com", data: { source: "illawarra-chat", type: "resize", width: 380, height: 520 } }),
    );
    expect(iframe.style.width).toBe("380px");
    expect(iframe.style.height).toBe("520px");

    window.dispatchEvent(new MessageEvent("message", { origin: "https://chat.example.com", data: { source: "illawarra-chat", type: "close" } }));
    expect(iframe.style.display).toBe("none");
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses the full screen on a narrow viewport once the chat is open", () => {
    window.innerWidth = 390;
    run({});
    document.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const iframe = frame();
    expect(iframe.style.width).toBe("100%");
    expect(iframe.style.height).toBe("100%");
    expect(iframe.style.top).toBe("0px");
    expect(iframe.src).toBe("https://chat.example.com/embed?open=1");
  });

  it("does nothing when the inline target is missing", () => {
    expect(() => run({ "data-mode": "inline", "data-target": "#missing" }, "<main></main>")).not.toThrow();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
