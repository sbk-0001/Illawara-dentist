import type { Metadata } from "next";
import { EmbedFrame } from "./embed-frame";
import "./embed.module.css";

export const metadata: Metadata = {
  title: "Illawarra Dentists chat",
  description: "Chat with Illawarra Dentists.",
};

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ open?: string; inline?: string }> }) {
  const params = await searchParams;
  const inline = params.inline === "1";
  const open = inline || params.open === "1";
  return (
    <div className="illawarra-embed">
      <EmbedFrame presentation={inline ? "inline" : open ? "panel" : "widget"} defaultOpen={open} />
    </div>
  );
}
