/**
 * MediaRecorder timeslices start before the Deepgram socket opens.
 * The first WebM blob is the EBML header. If it is dropped, later
 * clusters cannot be decoded and the live transcript stays empty.
 */
export type MicAudioQueue = {
  pending: Blob[];
  live: boolean;
};

export function createMicAudioQueue(): MicAudioQueue {
  return { pending: [], live: false };
}

export function enqueueMicAudio(queue: MicAudioQueue, chunk: Blob, send: (chunk: Blob) => void): void {
  if (chunk.size <= 0) return;
  if (queue.live) {
    send(chunk);
    return;
  }
  queue.pending.push(chunk);
}

/** Send every chunk captured before the socket opened, header first, then stream live. */
export function flushMicAudio(queue: MicAudioQueue, send: (chunk: Blob) => void): void {
  const buffered = queue.pending;
  queue.pending = [];
  queue.live = true;
  for (const chunk of buffered) send(chunk);
}

/** Upload the recording when live speech produced no transcript, or the socket never opened. */
export function shouldUploadRecording(input: {
  byteLength: number;
  transcript: string;
  socketOpened: boolean;
  needsRepair: boolean;
}): boolean {
  if (input.byteLength <= 0) return false;
  if (!input.transcript.trim()) return true;
  if (!input.socketOpened) return true;
  return input.needsRepair;
}
