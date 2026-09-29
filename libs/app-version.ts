/**
 * Where this build stands against the store-update policy in
 * public.app_min_versions (see components/UpdateGate).
 */
export type UpdateMode = "required" | "recommended";

/** Compares dotted numeric versions: "1.17.7" < "1.18.0" < "1.18.10". */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Below min_version the update is required; below recommended_version it is asked for. */
export function updateMode(
  current: string,
  policy: { min_version?: string | null; recommended_version?: string | null },
): UpdateMode | null {
  if (policy.min_version && compareVersions(current, policy.min_version) < 0) return "required";
  if (policy.recommended_version && compareVersions(current, policy.recommended_version) < 0) return "recommended";
  return null;
}
