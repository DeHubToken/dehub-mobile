export interface CalendarQrDetails { eventTitle: string; eventStart: string; eventEnd: string; eventLocation: string; eventNotes: string }
export function calendarQrContent(value: CalendarQrDetails, allDay = false, now = new Date()): string {
  const title = value.eventTitle.trim(), location = value.eventLocation.trim(), notes = value.eventNotes.trim();
  if (!title || title.length > 120 || location.length > 200 || notes.length > 500) throw new Error("Enter an event title, with location up to 200 characters and notes up to 500 characters");
  if (/[\u0000-\u001f\u007f]/.test(title + location) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)) throw new Error("Remove control characters from the event details");
  const parse = (text: string): Date => {
    const input = text.trim(), pattern = allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
    if (!pattern.test(input) || input.startsWith("0000")) throw new Error(allDay ? "Use real dates in YYYY-MM-DD format" : "Use UTC dates and times in YYYY-MM-DDTHH:mm format");
    const date = new Date(input + (allDay ? "T00:00:00Z" : input.length === 16 ? ":00Z" : "Z"));
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, input.length) !== input) throw new Error("Choose a valid calendar date and time");
    return date;
  };
  const start = parse(value.eventStart), end = parse(value.eventEnd);
  if (allDay ? end < start : end <= start) throw new Error(allDay ? "The last day must be on or after the first day" : "The event end must be later than its start");
  if (allDay) { end.setUTCDate(end.getUTCDate() + 1); if (end.getUTCFullYear() > 9999) throw new Error("Choose an event ending before 31 December 9999"); }
  if (!Number.isFinite(now.getTime()) || now.getUTCFullYear() < 1 || now.getUTCFullYear() > 9999) throw new Error("Could not determine the calendar creation time");
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const identity = JSON.stringify([title, format(start), format(end), allDay, location, notes]);
  const uid = [2166136261, 3335557771, 1013904223, 2246822519].map(seed => { let hash = seed; for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619); return (hash >>> 0).toString(16).padStart(8, "0"); }).join("") + "@dehub.io";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DeHub//Calendar//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + format(now), (allDay ? "DTSTART;VALUE=DATE:" + format(start).slice(0, 8) : "DTSTART:" + format(start)), (allDay ? "DTEND;VALUE=DATE:" + format(end).slice(0, 8) : "DTEND:" + format(end)), "SUMMARY:" + escape(title), ...(location ? ["LOCATION:" + escape(location)] : []), ...(notes ? ["DESCRIPTION:" + escape(notes)] : []), "END:VEVENT", "END:VCALENDAR"];
  return lines.map(line => {
    let result = "", bytes = 0;
    for (const char of line) { const code = char.codePointAt(0)!, size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; if (bytes + size > 75) { result += "\r\n "; bytes = 1; } result += char; bytes += size; }
    return result;
  }).join("\r\n") + "\r\n";
}
