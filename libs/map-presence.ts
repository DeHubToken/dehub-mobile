export type PresenceRequest = {
  source: 'gods-eye-view';
  type: 'presence-place-requested' | 'presence-remove-requested';
  requestId: string;
  latitude?: number;
  longitude?: number;
};

/** Only these two explicit operations can reach the account-bound map endpoint. */
export function parsePresenceRequest(value: unknown): PresenceRequest | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.source !== 'gods-eye-view' ||
      !['presence-place-requested', 'presence-remove-requested'].includes(String(data.type)) ||
      typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 100) return null;
  const hasCoordinates = data.latitude !== undefined || data.longitude !== undefined;
  if (hasCoordinates && (
    data.type !== 'presence-place-requested' ||
    typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90 ||
    typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180
  )) return null;
  return {
    source: 'gods-eye-view', type: data.type as PresenceRequest['type'], requestId: data.requestId,
    ...(hasCoordinates ? { latitude: data.latitude as number, longitude: data.longitude as number } : {}),
  };
}
