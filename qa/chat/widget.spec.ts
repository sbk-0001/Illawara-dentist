import { expect, test } from "@playwright/test";
import path from "node:path";

/**
 * Browser checks do not call the language model or Deepgram.
 * getUserMedia, /api/chat/stt-token and /api/chat/transcribe are mocked.
 * The Arabic thread on /?fixture=arabic is a static preview built from the
 * crawled Shellharbour contact card, not a model completion.
 */

const screenshots = path.join(process.cwd(), "qa/chat/screenshots");

test("desktop widget opens with Auto and an idle mic", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("chat-launcher").click();
  const panel = page.getByTestId("chat-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("chat-language")).toHaveValue("auto");
  await expect(page.getByTestId("chat-mic")).toHaveAttribute("data-mic", "idle");
  await expect(panel).toHaveAttribute("dir", "ltr");
  await page.screenshot({ path: path.join(screenshots, "desktop.png"), fullPage: false });
});

test("phone layout keeps the open panel on a 390px screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("chat-launcher").click();
  const panel = page.getByTestId("chat-panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: path.join(screenshots, "phone.png"), fullPage: false });
});

test("Arabic picker and fixture use RTL", async ({ page }) => {
  await page.goto("/?fixture=arabic");
  const panel = page.getByTestId("chat-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("ما هي ساعات العمل يوم السبت في شيلهاربر؟")).toBeVisible();
  await page.getByTestId("chat-language").selectOption("ar");
  await expect(panel).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: path.join(screenshots, "arabic-rtl.png"), fullPage: false });
});

test("mic button moves through listening and transcribing when speech APIs are mocked", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    void original;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await page.route("**/api/chat/stt-token", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "mocked" }) }),
  );
  await page.route("**/api/chat/transcribe", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ transcript: "Saturday hours at Shellharbour", language: "en" }),
    });
  });

  await page.goto("/");
  await page.getByTestId("chat-launcher").click();
  const mic = page.getByTestId("chat-mic");
  await mic.click();
  await expect(mic).toHaveAttribute("data-mic", "listening");
  await mic.click();
  await expect(mic).toHaveAttribute("data-mic", "transcribing");
  await expect(page.getByTestId("chat-input")).toHaveValue("Saturday hours at Shellharbour");
  await expect(mic).toHaveAttribute("data-mic", "idle");
});

test("mic reports unavailable when the browser denies the microphone", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByTestId("chat-launcher").click();
  const mic = page.getByTestId("chat-mic");
  await mic.click();
  await expect(mic).toHaveAttribute("data-mic", "unavailable");
  await expect(page.getByTestId("chat-mic-note")).toContainText("Microphone unavailable");
});
