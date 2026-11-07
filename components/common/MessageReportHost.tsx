/**
 * Report a chat message (DM, live chat, community chat).
 *
 * The message menus close as soon as a row is tapped, so the report sheet
 * cannot live inside them. It lives once at the app root instead, and any
 * menu opens it with `openMessageReport`. The report goes to moderators as a
 * report on the sender, with the message itself attached as context, so it
 * lands in the same review queue as profile reports (App Review 1.2).
 */
import React, { useEffect, useState } from "react";
import ReportModal from "./ReportModal";

export interface MessageReport {
  /** Sender's wallet address or username. */
  userId: string;
  userName?: string;
  /** Where it was said, e.g. "Direct message", "Live chat". */
  where: string;
  messageId?: string;
  text?: string;
}

type Listener = (report: MessageReport) => void;
const listeners = new Set<Listener>();

export function openMessageReport(report: MessageReport): void {
  listeners.forEach((listener) => listener(report));
}

function contextFor(report: MessageReport): string {
  const text = (report.text || "").trim().slice(0, 500);
  return [
    `Reported message (${report.where})`,
    report.messageId ? `Message id: ${report.messageId}` : null,
    text ? `Text: ${text}` : null,
  ].filter(Boolean).join("\n");
}

/**
 * The same sheet, for a chat that lives inside its own native Modal (a stage,
 * an event sheet). iOS will not present the root host's sheet over another
 * Modal, so those surfaces mount this one inside theirs.
 */
export function MessageReportModal({ report, onClose }: { report: MessageReport | null; onClose: () => void }) {
  if (!report) return null;
  return (
    <ReportModal
      visible
      onClose={onClose}
      type="user"
      userId={report.userId}
      userName={report.userName}
      context={contextFor(report)}
    />
  );
}

export default function MessageReportHost() {
  const [report, setReport] = useState<MessageReport | null>(null);
  useEffect(() => {
    const listener: Listener = (next) => setReport(next);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return <MessageReportModal report={report} onClose={() => setReport(null)} />;
}
