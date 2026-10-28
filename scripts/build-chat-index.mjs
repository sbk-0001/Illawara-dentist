/**
 * Crawl the three Illawarra Dentists public sites into src/chat/data/knowledge-index.json.
 *
 * Usage: node scripts/build-chat-index.mjs
 * No API keys. Polite fetch of public HTML only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

const USER_AGENT = "IllawarraDentistsChatIndexer/1.0 (+public clinic pages for on-site chat)";
const OUT = path.join(process.cwd(), "src/chat/data/knowledge-index.json");
const MOCK_PHONE = "0242105301";

const SITES = [
  {
    clinic: "dapto",
    name: "Dapto Dentists",
    site: "https://daptodentists.com.au/",
    sitemaps: ["https://daptodentists.com.au/sitemap.xml"],
  },
  {
    clinic: "shellharbour",
    name: "Shellharbour Dentists",
    site: "https://shellharbourdentist.com.au/",
    sitemaps: ["https://shellharbourdentist.com.au/page-sitemap.xml"],
  },
  {
    clinic: "woonona",
    name: "Woonona Dentists",
    site: "https://woononadentists.com.au/",
    sitemaps: ["https://woononadentists.com.au/page-sitemap.xml"],
  },
];

const SKIP_PATH = /\/(privacy-policy|terms-and-conditions|terms-conditions|disclaimer|fees-terms-and-conditions|sample-page|home-test|test)\/?$/i;

function clinicFromHost(hostname) {
  const host = hostname.replace(/^www\./, "");
  if (host.endsWith("daptodentists.com.au")) return "dapto";
  if (host.endsWith("shellharbourdentist.com.au")) return "shellharbour";
  if (host.endsWith("woononadentists.com.au")) return "woonona";
  return null;
}

function decodeCfEmail(encoded) {
  if (!encoded || encoded.length < 4 || encoded.length % 2 !== 0) return "";
  try {
    const key = Number.parseInt(encoded.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < encoded.length; i += 2) {
      out += String.fromCharCode(Number.parseInt(encoded.slice(i, i + 2), 16) ^ key);
    }
    return out.includes("@") ? out : "";
  } catch {
    return "";
  }
}

function normalizePhone(raw) {
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("61")) digits = `0${digits.slice(2)}`;
  if (digits.length === 9) digits = `0${digits}`;
  if (digits.length !== 10 || !digits.startsWith("0")) return null;
  if (digits === MOCK_PHONE) return null;
  return { digits, display: `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}` };
}

function cleanTitle(raw) {
  let title = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\s+[|\-–—]\s+(Dapto Dentists|Shellharbour Dentists?|Woonona Dentists)\s*$/i, "")
    .trim();
  title = title.replace(/^\s*\|\s*/, "").trim();
  return title;
}

function shouldSkip(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return true;
  }
  if (!clinicFromHost(url.hostname)) return true;
  const pathname = url.pathname.toLowerCase();
  if (pathname.includes("/wp-content/") || pathname.includes("/wp-json/")) return true;
  if (/\.(jpg|jpeg|png|webp|gif|svg|pdf|xml|zip|mp4|mp3)$/i.test(pathname)) return true;
  if (SKIP_PATH.test(pathname)) return true;
  return false;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml,text/xml,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function collectLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, "&").trim(),
  );
}

async function urlsForSite(site) {
  const found = new Set();
  for (const sitemap of site.sitemaps) {
    const xml = await fetchText(sitemap);
    for (const loc of collectLocs(xml)) {
      if (/\.xml($|\?)/i.test(loc) && !loc.endsWith(".xml/") ) {
        if (/sitemap/i.test(loc) && loc !== sitemap) {
          try {
            const nested = await fetchText(loc);
            for (const child of collectLocs(nested)) found.add(child.split("#")[0]);
          } catch (error) {
            console.warn("nested sitemap failed", loc, error.message);
          }
        }
      }
      found.add(loc.split("#")[0]);
    }
  }
  return [...found].filter((url) => !shouldSkip(url));
}

function walkJsonLd(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, visit);
    return;
  }
  visit(node);
  if (node["@graph"]) walkJsonLd(node["@graph"], visit);
  if (node.mainEntity) walkJsonLd(node.mainEntity, visit);
}

function formatJsonLdHours(specs) {
  const list = Array.isArray(specs) ? specs : specs ? [specs] : [];
  const parts = [];
  for (const spec of list) {
    if (!spec || typeof spec !== "object") continue;
    const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
    const names = days
      .map((day) => String(day || "").replace("https://schema.org/", ""))
      .filter(Boolean);
    if (!names.length || !spec.opens || !spec.closes) continue;
    const label =
      names.length === 5 && names[0] === "Monday" && names[4] === "Friday"
        ? "Monday–Friday"
        : names.join(", ");
    parts.push(`${label} ${String(spec.opens).slice(0, 5)}–${String(spec.closes).slice(0, 5)}`);
  }
  return parts.join("; ");
}

function extractHours(text) {
  const compact = text.replace(/\s+/g, " ");
  const clock = String.raw`\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)`;
  const range = String.raw`${clock}\s*[–\-—]\s*${clock}`;
  const match = compact.match(
    new RegExp(
      String.raw`((?:Mon(?:day)?)\s*[–\-—]\s*(?:Fri(?:day)?)\s*${range}(?:\s*(?:Sat(?:urday)?)\s*(?:Appointment only|${range}))?)`,
      "i",
    ),
  );
  if (!match) return "";
  return match[1].replace(/\s+/g, " ").replace(/([ap]m)(?=Saturday)/i, "$1 ").trim();
}

function postalLine(address) {
  if (!address || typeof address !== "object") return "";
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddress(raw) {
  const address = String(raw || "").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  if (!address) return "";
  if (/\b(?:am|pm)\b/i.test(address)) return "";
  if (/\b(?:Monday|Friday|Saturday|Sunday)\b/i.test(address)) return "";
  if (!/NSW/i.test(address) || !/\d{4}/.test(address)) return "";
  return address;
}

function extractAddress(text) {
  const compact = text.replace(/\s+/g, " ");
  const patterns = [
    /((?:Suite|Shop|Level)\s+\d[\w\s,.'-]{0,90}?NSW,?\s*\d{4})/i,
    /(\d{1,4}\s+[A-Za-z][\w\s,'-]{3,80}?NSW,?\s*\d{4})/,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const address = cleanAddress(match[1]);
    if (address) return address;
  }
  return "";
}

function pushCount(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function topKey(map) {
  let best = "";
  let score = 0;
  for (const [key, value] of map) {
    if (value > score) {
      best = key;
      score = value;
    }
  }
  return best;
}

function chunkText(heading, text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 80) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > 1100 && current.length > 200) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current.trim().length >= 80) chunks.push(current.trim());
  return chunks.map((part) => ({ heading: heading || "", text: part }));
}

function extractPage(html, url) {
  const $ = load(html);
  const og = $('meta[property="og:title"]').attr("content") || "";
  const docTitle = $("title").first().text() || "";
  const title = cleanTitle(og || docTitle) || cleanTitle(docTitle) || "Page";

  const faqs = [];
  const ldFacts = { phones: [], emails: [], addresses: [], hours: [] };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    try {
      const data = JSON.parse(raw);
      walkJsonLd(data, (node) => {
        const type = node["@type"];
        const types = (Array.isArray(type) ? type : [type]).map((item) => String(item || ""));
        if (types.includes("Question")) {
          const question = String(node.name || "").replace(/\s+/g, " ").trim();
          const answerNode = node.acceptedAnswer || {};
          const answer = String(answerNode.text || answerNode.name || "").replace(/\s+/g, " ").trim();
          if (question && answer) faqs.push({ question, answer });
        }
        if (types.some((item) => /Dentist|LocalBusiness|MedicalClinic|Organization/.test(item))) {
          if (node.telephone) ldFacts.phones.push(String(node.telephone));
          if (node.email) ldFacts.emails.push(String(node.email));
          const line = postalLine(node.address);
          if (line) ldFacts.addresses.push(line);
          const hours = formatJsonLdHours(node.openingHoursSpecification)
            .replace(/;?\s*Sunday\s+00:00–00:00/g, "")
            .replace(/^;\s*/, "")
            .trim();
          if (hours && !/Sunday 09:00–17:00/.test(hours)) ldFacts.hours.push(hours);
        }
        if (types.includes("PostalAddress")) {
          const line = postalLine(node);
          if (line) ldFacts.addresses.push(line);
        }
      });
    } catch {
      // Ignore broken JSON-LD blocks.
    }
  });

  const emails = new Set(ldFacts.emails.map((item) => item.toLowerCase()));
  $("[data-cfemail]").each((_, el) => {
    const decoded = decodeCfEmail($(el).attr("data-cfemail") || "");
    if (decoded) emails.add(decoded.toLowerCase());
  });
  const emailMatches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const email of emailMatches) {
    const lower = email.toLowerCase();
    if (!lower.endsWith(".png") && !lower.includes("example.com") && !lower.includes("w3.org") && !lower.includes("schema.org") && !lower.includes("sentry")) {
      emails.add(lower);
    }
  }

  const phones = [];
  for (const raw of ldFacts.phones) {
    const phone = normalizePhone(raw);
    if (phone) phones.push(phone);
  }
  const telHrefs = html.match(/tel:([^"'<\s]+)/gi) || [];
  for (const href of telHrefs) {
    const phone = normalizePhone(href.replace(/^tel:/i, ""));
    if (phone) phones.push(phone);
  }

  const bookings = [
    ...html.matchAll(/https?:\/\/bookings\.zavy360\.com\/[^\s"'<>\\]+/gi),
  ].map((match) => match[0].replace(/\\+$/g, "").replace(/[),.;]+$/g, ""));

  $("script, style, noscript, svg, iframe").remove();
  const headerText = $("body").text().replace(/\s+/g, " ").trim();
  const visibleHours = extractHours(headerText.slice(0, 5000));
  const visibleAddress = extractAddress(headerText.slice(0, 5000));

  $("nav, header, footer, [role='navigation'], .site-header, .site-footer, #masthead").remove();
  const root = $("main").length ? $("main") : $("body");
  const blocks = [];
  let heading = title;
  let buffer = [];
  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (text) blocks.push({ heading, text });
  };
  root.find("h1, h2, h3, h4, p, li").each((_, el) => {
    const tag = el.tagName?.toLowerCase() || "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return;
    if (/^h[1-4]$/.test(tag)) {
      flush();
      heading = text.slice(0, 180);
      return;
    }
    buffer.push(text);
  });
  flush();

  let pieces = [];
  for (const block of blocks) {
    pieces.push(...chunkText(block.heading, block.text));
  }
  if (!pieces.length) {
    pieces = chunkText(title, root.text());
  }
  for (const faq of faqs) {
    pieces.push({ heading: faq.question, text: `${faq.question} ${faq.answer}`.replace(/\s+/g, " ").trim() });
  }

  const seen = new Set();
  const chunks = [];
  for (const piece of pieces) {
    const text = piece.text.replace(/\s+/g, " ").trim();
    if (text.length < 80) continue;
    const key = text.slice(0, 240).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if ((text.match(/\b(About|Services|Contact|Home)\b/g) || []).length > 14 && text.length < 400) continue;
    chunks.push({ heading: piece.heading.slice(0, 180), text: text.slice(0, 1400) });
  }

  return {
    title,
    chunks,
    phones,
    emails: [...emails],
    bookings: [...new Set(bookings)],
    hours: visibleHours || ldFacts.hours[0] || "",
    jsonLdHours: ldFacts.hours[0] || "",
    address: ldFacts.addresses[0] || visibleAddress || "",
  };
}

function emptyContact(site) {
  return {
    clinic: site.clinic,
    name: site.name,
    site: site.site,
    phone: "",
    phoneDigits: "",
    otherPhones: [],
    email: "",
    bookingUrl: "",
    address: "",
    hours: "",
    phoneCounts: new Map(),
    emailCounts: new Map(),
    bookingCounts: new Map(),
    hoursCandidates: [],
    addressCandidates: [],
    contactPhones: new Set(),
  };
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}

async function main() {
  const contacts = new Map(SITES.map((site) => [site.clinic, emptyContact(site)]));
  const pages = [];
  const chunks = [];

  for (const site of SITES) {
    const urls = [...new Set(await urlsForSite(site))];
    console.log(`${site.clinic}: ${urls.length} urls`);
    const contact = contacts.get(site.clinic);
    await mapPool(urls, 4, async (url) => {
      try {
        const html = await fetchText(url);
        const parsed = extractPage(html, url);
        const pathname = new URL(url).pathname.toLowerCase();
        const priority = pathname === "/" || /contact|our-fees|about/.test(pathname) ? 3 : 1;
        const onContact = pathname === "/" || pathname.includes("contact");
        for (const phone of parsed.phones) {
          if (!onContact && priority < 3) continue;
          contact.phoneCounts.set(phone.digits, (contact.phoneCounts.get(phone.digits) || 0) + (onContact ? priority + 2 : priority));
          if (onContact) contact.contactPhones.add(phone.digits);
        }
        for (const email of parsed.emails) {
          if (/dentist|illawarra|info@/.test(email)) {
            contact.emailCounts.set(email, (contact.emailCounts.get(email) || 0) + priority);
          }
        }
        for (const booking of parsed.bookings) {
          contact.bookingCounts.set(booking, (contact.bookingCounts.get(booking) || 0) + priority);
        }
        if (parsed.hours && priority >= 3) contact.hoursCandidates.push({ hours: parsed.hours, priority: priority + 2, url, source: "visible" });
        if (parsed.jsonLdHours) contact.hoursCandidates.push({ hours: parsed.jsonLdHours, priority, url, source: "jsonld" });
        if (parsed.address) contact.addressCandidates.push({ address: parsed.address, priority: parsed.address.includes("Suite") || /\d+\s+[A-Za-z]/.test(parsed.address) ? priority + 1 : priority, url });

        const tagged =
          /woonona/.test(pathname) && site.clinic === "dapto"
            ? "woonona"
            : /shellharbour/.test(pathname) && site.clinic === "dapto"
              ? "shellharbour"
              : site.clinic;
        if (!parsed.chunks.length) {
          console.warn("no chunks", url);
          return;
        }
        pages.push({ url, title: parsed.title, clinic: tagged, chunkCount: parsed.chunks.length });
        const slug = (pathname.replace(/\/+$/, "").split("/").filter(Boolean).join("-") || "home")
          .replace(/[^a-z0-9-]+/gi, "-")
          .slice(0, 80);
        parsed.chunks.forEach((chunk, index) => {
          chunks.push({
            id: `${tagged}-${slug}-${index}`,
            clinic: tagged,
            url,
            title: parsed.title,
            heading: chunk.heading,
            text: chunk.text,
          });
        });
        process.stdout.write(".");
      } catch (error) {
        console.warn("\nfail", url, error.message);
      }
    });
    process.stdout.write("\n");
  }

  const contactOut = {};
  for (const site of SITES) {
    const contact = contacts.get(site.clinic);
    const phoneDigits = topKey(contact.phoneCounts);
    const phone = phoneDigits ? normalizePhone(phoneDigits) : null;
    const otherPhones = [...contact.contactPhones]
      .filter((digits) => digits !== phoneDigits)
      .map((digits) => normalizePhone(digits)?.display)
      .filter(Boolean);
    const visibleHours = contact.hoursCandidates.filter((item) => item.source === "visible");
    const hours = (visibleHours.length ? visibleHours : contact.hoursCandidates).sort((a, b) => b.priority - a.priority || b.hours.length - a.hours.length)[0];
    const address = [...contact.addressCandidates]
      .map((item) => ({ ...item, address: cleanAddress(item.address) }))
      .filter((item) => item.address)
      .sort((a, b) => b.priority - a.priority)[0];
    contactOut[site.clinic] = {
      clinic: site.clinic,
      name: site.name,
      site: site.site,
      phone: phone?.display || "",
      phoneDigits: phone?.digits || "",
      otherPhones,
      email: topKey(contact.emailCounts),
      bookingUrl: topKey(contact.bookingCounts),
      address: cleanAddress(address?.address || ""),
      hours: hours?.hours || "",
    };
    const card = contactOut[site.clinic];
    if (!card.phone || !card.email || !card.bookingUrl || !card.address || !/mon/i.test(card.hours) || !/\d/.test(card.hours) || card.hours.length > 120) {
      throw new Error(`Incomplete contact card for ${site.clinic}: ${JSON.stringify(card)}`);
    }
    if (contactOut[site.clinic].phoneDigits === MOCK_PHONE) {
      throw new Error("Refusing to publish the concept mock phone as a clinic number");
    }
    if (!contactOut[site.clinic].bookingUrl.includes("bookings.zavy360.com")) {
      throw new Error(`Booking link for ${site.clinic} is not a Zavy360 URL`);
    }
  }

  const pageCounts = { dapto: 0, shellharbour: 0, woonona: 0 };
  for (const page of pages) {
    const hostClinic = clinicFromHost(new URL(page.url).hostname);
    if (hostClinic) pageCounts[hostClinic] += 1;
  }
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "Public pages crawled from the three clinic websites. Answers must stay inside this index.",
    pageCounts,
    chunkCount: chunks.length,
    contacts: contactOut,
    pages: pages.map(({ url, title, clinic }) => ({ url, title, clinic })),
    chunks,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(index, null, 2)}\n`);
  console.log(JSON.stringify({ pageCounts, chunkCount: chunks.length, contacts: contactOut }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
