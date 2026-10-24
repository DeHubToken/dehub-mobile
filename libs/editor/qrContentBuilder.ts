import { calendarQrContent, type CalendarQrDetails } from "./calendarQr";
export type QrContentKind = "wifi" | "email" | "phone" | "contact" | "sms" | "calendar";
export interface QrContentDetails extends CalendarQrDetails { ssid: string; password: string; email: string; subject: string; body: string; phone: string; firstName: string; lastName: string; company: string; jobTitle: string; website: string }
export const EMPTY_QR_DETAILS: QrContentDetails = { eventTitle: "", eventStart: "", eventEnd: "", eventLocation: "", eventNotes: "", ssid: "", password: "", email: "", subject: "", body: "", phone: "", firstName: "", lastName: "", company: "", jobTitle: "", website: "" };
export function qrContentFields(kind: QrContentKind, allDay = false): { key: keyof QrContentDetails; label: string; limit: number; multiline?: boolean; secret?: boolean }[] {
  if (kind === "calendar") return [{ key: "eventTitle", label: "Event title", limit: 120 }, { key: "eventStart", label: allDay ? "First day (YYYY-MM-DD)" : "Start (UTC, YYYY-MM-DDTHH:mm)", limit: 19 }, { key: "eventEnd", label: allDay ? "Last day, inclusive (YYYY-MM-DD)" : "End (UTC, YYYY-MM-DDTHH:mm)", limit: 19 }, { key: "eventLocation", label: "Location (optional)", limit: 200 }, { key: "eventNotes", label: "Event notes (optional)", limit: 500, multiline: true }];
  if (kind === "sms") return [{ key: "phone", label: "Recipient phone with country code", limit: 60 }, { key: "body", label: "Message (optional)", limit: 800, multiline: true }];
  if (kind === "contact") return [{ key: "firstName", label: "First name", limit: 80 }, { key: "lastName", label: "Last name", limit: 80 }, { key: "company", label: "Company (optional)", limit: 100 }, { key: "jobTitle", label: "Job title (optional)", limit: 100 }, { key: "email", label: "Email address (optional)", limit: 254 }, { key: "phone", label: "Phone with country code (optional)", limit: 60 }, { key: "website", label: "Website URL (optional)", limit: 300 }];
  return kind === "wifi" ? [{ key: "ssid", label: "Network name", limit: 128 }, { key: "password", label: "Network password", limit: 128, secret: true }] : kind === "email" ? [{ key: "email", label: "Email address", limit: 254 }, { key: "subject", label: "Subject", limit: 200 }, { key: "body", label: "Message", limit: 800, multiline: true }] : [{ key: "phone", label: "Phone number with country code", limit: 60 }];
}
export function buildQrContent(kind: QrContentKind, value: QrContentDetails, wifi: { security: "WPA" | "WEP" | "nopass"; hidden: boolean }, calendar: { allDay?: boolean } = {}): string {
  let result = "";
  if (kind === "calendar") result = calendarQrContent(value, calendar.allDay);
  else if (kind === "contact") {
    for (const field of qrContentFields(kind)) if (value[field.key].length > field.limit || /[\u0000-\u001f\u007f]/.test(value[field.key])) throw new Error("Shorten contact fields and remove line breaks");
    const first = value.firstName.trim(), last = value.lastName.trim(), address = value.email.trim(), phone = value.phone.replace(/[\s().-]/g, ""), website = value.website.trim();
    if (!first && !last) throw new Error("Enter a first or last name for this contact");
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter a valid contact email address");
    if (phone && !/^\+?\d{3,20}$/.test(phone)) throw new Error("Use digits and an optional leading plus sign for the contact phone");
    if (website) { let url: URL; try { url = new URL(website); } catch { throw new Error("Use a complete contact website URL beginning with https:// or http://"); } if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Use an http or https contact website without login details"); }
    const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
    const lines = ["BEGIN:VCARD", "VERSION:3.0", "N:" + escape(last) + ";" + escape(first) + ";;;", "FN:" + escape([first, last].filter(Boolean).join(" ")), ...(value.company.trim() ? ["ORG:" + escape(value.company.trim())] : []), ...(value.jobTitle.trim() ? ["TITLE:" + escape(value.jobTitle.trim())] : []), ...(address ? ["EMAIL;TYPE=INTERNET:" + escape(address)] : []), ...(phone ? ["TEL;TYPE=CELL:" + phone] : []), ...(website ? ["URL:" + website] : []), "END:VCARD"];
    // Fold by UTF-8 octets without splitting a Unicode code point.
    result = lines.map(line => { let folded = "", bytes = 0; for (const char of line) { const code = char.codePointAt(0)!, size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; if (bytes + size > 75) { folded += "\r\n "; bytes = 1; } folded += char; bytes += size; } return folded; }).join("\r\n") + "\r\n";
  } else if (kind === "wifi") {
    let bytes = 0; for (const char of value.ssid) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
    if (!bytes || bytes > 32 || /[\u0000-\u001f\u007f]/.test(value.ssid)) throw new Error("Use a network name containing 1–32 UTF-8 bytes");
    if (!["WPA", "WEP", "nopass"].includes(wifi.security) || wifi.security !== "nopass" && (!value.password || value.password.length > 128 || /[\u0000-\u001f\u007f]/.test(value.password))) throw new Error("Choose network security and enter its password");
    const escape = (text: string) => { const escaped = text.replace(/[\\;,:\"]/g, "\\$&"); return /^[a-f\d]+$/i.test(text) && text.length % 2 === 0 ? '"' + escaped + '"' : escaped; };
    result = "WIFI:" + [`T:${wifi.security}`, `S:${escape(value.ssid)}`, ...(wifi.security === "nopass" ? [] : [`P:${escape(value.password)}`]), ...(wifi.hidden ? ["H:true"] : [])].join(";") + ";;";
  } else if (kind === "email") {
    const address = value.email.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) throw new Error("Enter a valid email address");
    const parameters = [...(value.subject ? ["subject=" + encodeURIComponent(value.subject)] : []), ...(value.body ? ["body=" + encodeURIComponent(value.body)] : [])];
    result = "mailto:" + encodeURIComponent(address).replace(/%40/gi, "@") + (parameters.length ? "?" + parameters.join("&") : "");
  } else {
    const phone = value.phone.replace(/[\s().-]/g, ""); if (!/^\+?\d{3,20}$/.test(phone)) throw new Error("Use a phone number with digits and an optional leading country-code plus sign");
    if (kind === "sms" && value.body.length > 800) throw new Error("Keep the SMS message within 800 characters");
    result = kind === "sms" ? "sms:" + phone + (value.body ? "?body=" + encodeURIComponent(value.body) : "") : "tel:" + phone;
  }
  if (result.length > 1500) throw new Error("Shorten these details to fit within the QR content limit");
  return result;
}
