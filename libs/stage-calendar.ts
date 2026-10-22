/**
 * Add an announced stage to the phone's calendar, like web's .ics download
 * (dehubweb lib/stage-calendar). Stages carry no stated length, so the event
 * blocks an hour, with a 10-minute alert.
 *
 * iOS shares the .ics file itself, which the share sheet hands to Calendar.
 * Android has no file share without a native module this binary may lack, so
 * it opens Google Calendar's prefilled event page instead.
 */
import { Linking, Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { ShareLinks } from "../navigation/linking.config";
import type { AudioSpace } from "../hooks/useStages";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const icsEscape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function stageIcs(stage: AudioSpace, now = new Date()): string | null {
  if (!stage.scheduled_at) return null;
  const start = new Date(stage.scheduled_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const link = ShareLinks.stage(stage);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DeHub//Stages//EN",
    "BEGIN:VEVENT",
    `UID:stage-${stage.id}@dehub.io`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(stage.title)}`,
    `DESCRIPTION:${icsEscape([stage.description || "", link].filter(Boolean).join("\n"))}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(stage.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function googleCalendarUrl(stage: AudioSpace): string | null {
  if (!stage.scheduled_at) return null;
  const start = new Date(stage.scheduled_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const link = ShareLinks.stage(stage);
  const params = [
    ["action", "TEMPLATE"],
    ["text", stage.title],
    ["dates", `${stamp(start)}/${stamp(end)}`],
    ["details", [stage.description || "", link].filter(Boolean).join("\n")],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `https://calendar.google.com/calendar/render?${params}`;
}

export async function addStageToCalendar(stage: AudioSpace): Promise<void> {
  if (Platform.OS === "ios" && FileSystem.cacheDirectory) {
    const ics = stageIcs(stage);
    if (!ics) return;
    const uri = `${FileSystem.cacheDirectory}dehub-stage-${stage.short_id ?? stage.id}.ics`;
    await FileSystem.writeAsStringAsync(uri, ics);
    await Share.share({ url: uri, title: stage.title });
    return;
  }
  const url = googleCalendarUrl(stage);
  if (url) await Linking.openURL(url);
}
