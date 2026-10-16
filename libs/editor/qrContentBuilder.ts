export type QrContentKind = "wifi" | "email" | "phone";
export interface QrContentDetails { ssid: string; password: string; email: string; subject: string; body: string; phone: string }
export const EMPTY_QR_DETAILS: QrContentDetails = { ssid: "", password: "", email: "", subject: "", body: "", phone: "" };
export function qrContentFields(kind: QrContentKind): { key: keyof QrContentDetails; label: string; limit: number; multiline?: boolean; secret?: boolean }[] {
  return kind === "wifi" ? [{ key: "ssid", label: "Network name", limit: 128 }, { key: "password", label: "Network password", limit: 128, secret: true }] : kind === "email" ? [{ key: "email", label: "Email address", limit: 254 }, { key: "subject", label: "Subject", limit: 200 }, { key: "body", label: "Message", limit: 800, multiline: true }] : [{ key: "phone", label: "Phone number with country code", limit: 60 }];
}
export function buildQrContent(kind: QrContentKind, value: QrContentDetails, wifi: { security: "WPA" | "WEP" | "nopass"; hidden: boolean }): string {
  let result = "";
  if (kind === "wifi") {
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
    result = "tel:" + phone;
  }
  if (result.length > 1500) throw new Error("Shorten these details to fit within the QR content limit");
  return result;
}
