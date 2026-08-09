type NotificationReadState = { read?: boolean };

export function extractNotificationItems(response: unknown): NotificationReadState[] {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];

  const envelope = response as {
    result?: unknown;
    data?: { result?: unknown };
  };
  const result = envelope.data?.result ?? envelope.result;

  return Array.isArray(result) ? result : [];
}

export function countUnreadNotifications(response: unknown): number {
  return extractNotificationItems(response).filter((notification) => notification?.read !== true).length;
}

export function incrementUnreadCount(current: number | undefined): number {
  return Math.max(0, Number.isFinite(current) ? current ?? 0 : 0) + 1;
}
