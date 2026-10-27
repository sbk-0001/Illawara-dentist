export type ClinicId = "dapto" | "shellharbour" | "woonona";

export type ContactCard = {
  clinic: ClinicId;
  name: string;
  site: string;
  phone: string;
  phoneDigits: string;
  otherPhones: string[];
  email: string;
  bookingUrl: string;
  address: string;
  hours: string;
};

export type KnowledgeChunk = {
  id: string;
  clinic: ClinicId;
  url: string;
  title: string;
  heading: string;
  text: string;
};

export type IndexedPage = {
  url: string;
  title: string;
  clinic: ClinicId;
};

export type KnowledgeIndex = {
  version: number;
  generatedAt: string;
  note: string;
  pageCounts: Record<ClinicId, number>;
  chunkCount: number;
  contacts: Record<ClinicId, ContactCard>;
  pages: IndexedPage[];
  chunks: KnowledgeChunk[];
};

export type SourceChip = {
  title: string;
  url: string;
  clinic: ClinicId;
};

export type ChatMetadata = {
  language?: string;
  dir?: "ltr" | "rtl";
  fallback?: boolean;
  sources?: SourceChip[];
};

export type ReplyLanguage = {
  code: string;
  label: string;
  script: string;
  dir: "ltr" | "rtl";
  fallback: boolean;
  source: "picker" | "detected" | "fallback";
};
