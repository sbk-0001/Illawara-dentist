import { describe, expect, it } from "vitest";
import { createMicAudioQueue, enqueueMicAudio, flushMicAudio, longerTranscript, shouldUploadRecording, SPEECH_END_WAIT_MS } from "./mic-audio";

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

describe("microphone audio before the socket opens", () => {
  it("holds chunks that arrive before open and flushes the WebM header first", () => {
    const queue = createMicAudioQueue();
    const sent: number[] = [];
    const send = (chunk: Blob) => sent.push(chunk.size);
    const header = blob(2400);
    const next = blob(800);

    enqueueMicAudio(queue, header, send);
    enqueueMicAudio(queue, blob(0), send);
    enqueueMicAudio(queue, next, send);
    expect(sent).toEqual([]);
    expect(queue.pending.map((chunk) => chunk.size)).toEqual([2400, 800]);

    flushMicAudio(queue, send);
    expect(sent).toEqual([2400, 800]);

    enqueueMicAudio(queue, blob(100), send);
    expect(sent).toEqual([2400, 800, 100]);
    expect(queue.pending).toEqual([]);
  });

  it("uploads an empty transcript when the recording has bytes, whether or not the socket opened", () => {
    expect(shouldUploadRecording({ byteLength: 2400, transcript: "", socketOpened: true, needsRepair: false })).toBe(true);
    expect(shouldUploadRecording({ byteLength: 2400, transcript: "   ", socketOpened: false, needsRepair: false })).toBe(true);
    expect(shouldUploadRecording({ byteLength: 2400, transcript: "ডাপ্টো", socketOpened: false, needsRepair: false })).toBe(true);
    expect(shouldUploadRecording({ byteLength: 2400, transcript: "ডাপ্টো", socketOpened: true, needsRepair: true })).toBe(true);
    expect(shouldUploadRecording({ byteLength: 2400, transcript: "What time does Dapto open?", socketOpened: true, needsRepair: false })).toBe(false);
    expect(shouldUploadRecording({ byteLength: 0, transcript: "", socketOpened: false, needsRepair: false })).toBe(false);
  });

  it("keeps a longer interim when a later final is only the first words", () => {
    expect(SPEECH_END_WAIT_MS).toBeLessThanOrEqual(1_200);
    const early = "मेरे दांत";
    const full = "मेरे दांत में बहुत दर्द हो रहा है";
    expect(longerTranscript(early, full)).toBe(full);
    expect(longerTranscript(full, early)).toBe(full);
  });
});
