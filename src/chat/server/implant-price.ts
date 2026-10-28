import type { ClinicFocus } from "../intent";
import { fillTemplate } from "./fill-template";
import templates from "./templates-v2.json";

/**
 * Shellharbour homepage: "Singular Implant with Crown from: $4500*".
 * The asterisk means terms and conditions apply and are discussed at the appointment.
 * Woonona: "$5000" with payment plans from about $30 a week. Not Shellharbour's figure.
 * Dapto: free consult and a $50 deposit refunded in full. No implant price.
 */
const IMPLANT_STEM =
  /implant|ഇംപ്ലാന്റ|ഇമ്പ്ലാന്റ|இம்ப்ள|இம்லான்|இம்ப்லான்|ইমপ্ল|इम्प्ला|种植|重植|implante|زراعة|زراعه/i;
const IMPLANT_FEE =
  /how much|\bprice\b|\bcost\b|\bfee\b|\betre\b|\$|എത്ര|ചെലവ|ചിലവ|വില|எவ்வளவு|எவ்வளவ|செலவு|விலை|কত|খরচ|দাম|कितन|कीमत|फीस|दाम|多少|precio|cuesta|سعر|تكلف|تكلفه|كم/i;

export function isImplantPriceQuestion(text: string): boolean {
  if (/zirconia/i.test(text)) return false;
  return IMPLANT_STEM.test(text) && IMPLANT_FEE.test(text);
}

export function implantPriceSentence(code: string, focus: ClinicFocus): string {
  const pack = templates.IMPLANT[code as keyof typeof templates.IMPLANT] ?? templates.IMPLANT.en;
  if (focus.kind === "one") return pack[focus.clinic];
  const all = templates.IMPLANT_ALL[code as keyof typeof templates.IMPLANT_ALL] ?? templates.IMPLANT_ALL.en;
  return fillTemplate(all, {});
}

/** Replace a price answer so $4500* stays on Shellharbour and $5000 stays on Woonona. */
export function guardImplantPrice(reply: string, question: string, code: string, focus: ClinicFocus): string {
  if (!isImplantPriceQuestion(question)) return reply;
  return implantPriceSentence(code, focus);
}
