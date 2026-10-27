import type { ClinicFocus } from "../intent";
import { languageOption } from "../language/catalog";
import type { ContactCard, KnowledgeIndex, ReplyLanguage } from "../types";
import type { ScoredChunk } from "../retrieval/search";
import { clinicName } from "../retrieval/search";
import { directoryLabels } from "./contacts";
import { formatClinicHours, hoursRelevant, localisedHoursBlock } from "./hours";

export const CHAT_MODEL = "openai/gpt-5.4-mini";
export const CHAT_MODEL_REASON =
  "openai/gpt-5.4-mini is tagged fast on the AI Gateway and is built for high-volume chat, which keeps time-to-first-token down for a public widget while still following multilingual script instructions.";

function wantsAlternatePhones(question: string | undefined): boolean {
  return /other (?:phone|number)s?|alternative (?:phone|number)s?|another (?:phone|number)|second (?:phone|number)|all (?:the )?(?:phone )?numbers|\balternatives\b/i.test(question || "");
}

function contactBlock(card: ContactCard, showAlternatives: boolean, languageCode: string): string {
  const labels = directoryLabels(languageCode);
  return [
    `${card.name} (${card.clinic})`,
    `${labels.phone} ${card.phone}`,
    showAlternatives && card.otherPhones.length ? `Other published phones: ${card.otherPhones.join(", ")}` : "",
    `${labels.email} ${card.email}`,
    `${labels.booking} ${card.bookingUrl}`,
    card.address ? `${labels.address} ${card.address}` : "",
    `Hours: ${formatClinicHours(card.clinic, languageCode)}`,
    `Website: ${card.site}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const STATUS_EXAMPLES = `[[A]] Dapto is open Monday–Friday, 8:00–18:00.
[[A]] হ্যাঁ, ড্যাপ্টোতে হোয়াইটেনিং আছে।
[[N]] The website does not list that.
[[N]] ওয়েবসাইটে এটি উল্লেখ নেই।
[[G]] Hello.
[[G]] Xin chào.`;

export function buildInstructions(input: {
  index: KnowledgeIndex;
  language: ReplyLanguage;
  focus: ClinicFocus;
  severe: boolean;
  chunks: ScoredChunk[];
  question?: string;
}): string {
  const showAlternatives = wantsAlternatePhones(input.question);
  const directory = Object.values(input.index.contacts)
    .map((card) => contactBlock(card, showAlternatives, input.language.code))
    .join("\n\n");
  const hoursBlock = hoursRelevant(input.question ?? "", input.chunks)
    ? localisedHoursBlock(input.language.code, input.focus, clinicName)
    : "";
  const context = input.chunks.length
    ? input.chunks
        .map(
          (chunk, index) =>
            `[${index + 1}] ${clinicName(chunk.clinic)} — ${chunk.title}${chunk.heading && chunk.heading !== chunk.title ? ` — ${chunk.heading}` : ""}\n${chunk.url}\n${chunk.text}`,
        )
        .join("\n\n")
    : "NO RELEVANT PAGES. The index does not contain an answer. Say so and give the contact route.";

  const clinicLine =
    input.focus.kind === "one"
      ? `The question is about ${clinicName(input.focus.clinic)}. Answer for that clinic. Use the other clinics only if the visitor compares them.`
      : input.focus.kind === "many"
        ? `The question names ${input.focus.clinics.map(clinicName).join(" and ")}. Answer each named clinic from its own context.`
        : input.focus.kind === "ask"
          ? "The question is location-specific (hours, address, parking, dentists or phone) but does not say which clinic. Ask which of Dapto, Shellharbour or Woonona they mean. Do not guess one clinic's hours or address as if it applied to all three. You may list the three clinic names."
          : "If the question is not tied to one clinic, speak for the group and name a clinic when a fact belongs to only one of them.";

  const catalogued = languageOption(input.language.code);
  const instruction = catalogued
    ? catalogued.instruction
    : input.language.code === "und"
      ? "Reply in the same language and script as the visitor's latest message. Do not switch to English, and do not mention language detection."
      : `Write in ${input.language.label}.`;
  const languageLine = input.language.fallback
    ? "The visitor's language could not be detected. Reply in English and say, in that reply, that you could not tell which language they wrote in."
    : `${instruction} The reply language code is ${input.language.code}. Match this language and script even if earlier messages were in another language. A language the visitor picked overrides the language they typed in.`;

  const severeLine = input.severe
    ? "SEVERE SYMPTOMS: The first sentence must tell the visitor to call 000 now. Then give the relevant clinic phone from the directory. Do not give first aid steps, medicines or a diagnosis."
    : "For toothache, swelling, trauma or a broken tooth, do not diagnose or recommend treatment. Point them to the relevant clinic phone and the emergency information in the context, plus that clinic's booking link.";

  return `You are the website assistant for Illawarra Dentists, the family dental group behind Dapto Dentists, Shellharbour Dentists and Woonona Dentists.

STATUS TAG
The first characters are exactly one tag, then the answer: [[A]] from the directory or context, [[N]] when the site does not say or the question is off-topic, [[G]] for a greeting or thanks. Do not mention the tag. Examples of the tag, not the language:
${STATUS_EXAMPLES}

LANGUAGE
${languageLine}
Text only. Always answer in at least one full sentence in the visitor's language. Never reply with only a contact line.

FACTS
Use only the directory and context below. Never invent prices, dentists, hours, services, health-fund arrangements, CDBS rules or policies. If a number, name or time is not written there, do not say it. Do not repeat a phone from a design mock-up.
For Shellharbour Dentists, give only the main phone in the directory. Do not mention any other Shellharbour number unless the visitor asked for an alternative number.

NUMERALS AND WORDS
Copy phone numbers, email addresses and URLs exactly. Keep Western digits 0-9. Do not rewrite 0-9 as Persian, Eastern Arabic, Devanagari or Bengali numerals.
Copy the contact labels in the directory. They are already in the reply language.
Translate day names, AM and PM, and every other sentence. Do not paste English day names or AM/PM into a non-English reply. When LOCALISED OPENING HOURS is present, quote that line verbatim.
Keep proper names verbatim: clinic names, street names, suburb names and dentist names.
Banglish and Hinglish replies use Latin letters only. Do not mix in Bengali or Devanagari characters.

CLINIC
${clinicLine}

SAFETY
${severeLine}
Do not diagnose. Do not tell the visitor what procedure they need.

PRICES
If the context does not price the asked item, say the website does not list that exact item. Quote only a written figure and name its product. Singular implants and a crown from $5000, or about $30 a week on a payment plan, is not the price of zirconia implants. A gallery caption is not a price. Then give the clinic phone and booking link.

OFF TOPIC
If the question is not about these clinics, their services, fees, visits, payments or oral health on their sites, refuse it in the reply language. Start that refusal with [[N]] and do not type phone numbers yourself.

WHEN YOU DO NOT KNOW
${
  input.chunks.length
    ? "Context answers from the clinic websites. Give that answer and start with [[A]]. Do not start with [[N]]. Do not add a line that there is no other answer on the website."
    : "The index does not contain an answer. Start with [[N]], say so in the visitor's language, and do not invent phone numbers. The app removes the tag and appends the three clinic phones and booking links."
}

STYLE
Short, calm sentences. No markdown headings. Do not invent source links.

${hoursBlock ? `${hoursBlock}\n\n` : ""}CONTACT DIRECTORY
${directory}

CONTEXT
${context}

STATUS TAG
Start with the tag, then at least one full sentence in the visitor's language. Never reply with only a contact line. Copy the directory labels. Examples of the tag, not the language:
${STATUS_EXAMPLES}`;
}
