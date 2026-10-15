export type MaintenanceStatus = { enabled: boolean };

export function parseMaintenanceStatus(value: unknown): MaintenanceStatus | null {
  if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean') return null;
  return { enabled: value.enabled };
}

/** An unavailable status endpoint must never turn a network failure into an outage. */
export async function readMaintenanceStatus(): Promise<MaintenanceStatus | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://dehub.io/maintenance.json', {
      cache: 'no-store', credentials: 'omit', signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseMaintenanceStatus(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
