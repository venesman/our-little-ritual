/**
 * "Add to calendar" for a call date. Two routes, both handled by the phone's
 * own apps — nothing is sent anywhere by Our Little Ritual:
 *  - an .ics file (Apple Calendar on iPhone/Mac, Outlook, most Android calendars)
 *  - a Google Calendar link that opens a pre-filled new event
 */
export interface CalendarEvent {
  title: string;
  start: number; // epoch ms
  end: number;
  description: string;
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 line folding at 75 octets (approximated by characters, safe for our ASCII-heavy text). */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

export function buildIcs(e: CalendarEvent, now = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Our Little Ritual//Call date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${stamp(e.start)}-${Math.random().toString(36).slice(2, 10)}@our-little-ritual`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.start)}/${stamp(e.end)}`,
    details: e.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(e: CalendarEvent, filename = "call-date.ics"): void {
  const blob = new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
