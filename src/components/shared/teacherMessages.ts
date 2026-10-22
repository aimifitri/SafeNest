// The two teacher messages from the original prototype (English and Bahasa Melayu).
// Pure text. SafeNest never sends these itself: the parent reviews the words, then sends them
// from WhatsApp or the share sheet. Nothing is "delivered" by the app.
import { clock } from "./circleEngine";

export type MsgLang = "en" | "ms";

type Common = { teacher: string; child: string; className: string };

/** "I cannot get to school by dismissal. I will leave at X and arrive around Y." */
export function teacherMessage(lang: MsgLang, a: Common & { dismiss: number; leaveAt: number; arrival: number | null }): string {
  const d = clock(a.dismiss), l = clock(a.leaveAt), r = a.arrival === null ? null : clock(a.arrival);
  if (lang === "en") {
    return `Hello ${a.teacher}, this is ${a.child}'s parent (Class ${a.className}). I cannot get to school by ${d}. I will leave at ${l}${r ? ` and should arrive around ${r}` : ""}. Please let ${a.child} wait at the school office. Thank you.`;
  }
  return `Salam ${a.teacher}, saya ibu/bapa ${a.child} (${a.className}). Saya tidak dapat sampai pada waktu pulang (${d}). Saya akan bertolak pada ${l}${r ? ` dan dijangka sampai sekitar ${r}` : ""}. Mohon ${a.child} menunggu di pejabat sekolah. Terima kasih.`;
}

/** "X will pick up the child around 12:57. Here is their photo so you can check." */
export function photoMessage(lang: MsgLang, a: Common & { collector: string; collectorRole: string; dismiss: number }): string {
  const at = clock(a.dismiss - 3);
  const role = a.collectorRole ? ` (${lang === "en" ? a.collectorRole : roleMs(a.collectorRole)})` : "";
  if (lang === "en") {
    return `Hello ${a.teacher}, ${a.collector}${role} will pick up ${a.child} (Class ${a.className}) around ${at}. Here is their photo so you can check before ${a.child} goes. Thank you.`;
  }
  return `Salam ${a.teacher}, ${a.collector}${role} akan mengambil ${a.child} (${a.className}) sekitar ${at}. Berikut gambar beliau untuk semakan cikgu sebelum ${a.child} pulang. Terima kasih.`;
}

const MS_ROLES: Record<string, string> = { Parent: "ibu/bapa", Brother: "abang", Sister: "kakak", Uncle: "bapa saudara", Aunt: "ibu saudara", Neighbour: "jiran", Grandparent: "datuk/nenek" };
const roleMs = (r: string): string => MS_ROLES[r] ?? r;

/** wa.me wants digits with the country code. "012-345 6789" -> "60123456789". Null if it cannot be made safely. */
export function whatsappNumber(phone: string, country = "60"): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith(country)) return digits;
  return country + digits.replace(/^0+/, "");
}

export const whatsappUrl = (phone: string, text: string): string | null => {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
};

/** Minutes after midnight the parent would arrive if they leave at `leaveAt` (travel time from where they are). */
export const arrivalIfLeaving = (leaveAt: number, travelMinutes: number): number => leaveAt + travelMinutes;
/** A wait longer than an hour is flagged, like the original "That is a long wait" card. */
export const isLongWait = (arrival: number, dismiss: number): boolean => arrival - dismiss > 60;
