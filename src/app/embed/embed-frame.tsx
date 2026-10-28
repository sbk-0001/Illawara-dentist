"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatWidget } from "@/chat";

const MESSAGE_SOURCE = "illawarra-chat";
const HOST_SOURCE = "illawarra-chat-host";

type Presentation = "widget" | "panel" | "inline";

function parentOrigin(): string | null {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

function postToParent(type: "open" | "close" | "resize", open: boolean) {
  if (window.parent === window) return;
  const target = parentOrigin() ?? "*";
  window.parent.postMessage(
    { source: MESSAGE_SOURCE, type, open, width: 400, height: 640 },
    target,
  );
}

export function EmbedFrame({ presentation, defaultOpen }: { presentation: Presentation; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    postToParent(open ? "open" : "close", open);
  }, [open]);

  useEffect(() => {
    const parent = parentOrigin();
    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || window.parent === window) return;
      if (parent && event.origin !== parent) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (!data || data.source !== HOST_SOURCE) return;
      if (data.type === "open") setOpen(true);
      if (data.type === "close") setOpen(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (window.parent === window) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => postToParent("resize", open));
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [open]);

  return (
    <ChatWidget
      presentation={presentation}
      defaultOpen={defaultOpen}
      open={presentation === "inline" ? true : open}
      onOpenChange={onOpenChange}
    />
  );
}
