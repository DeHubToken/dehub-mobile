export function presentationPageMatches(count: number, details: readonly { title?: string; section?: string }[] | undefined, query: string): number[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return Array.from({ length: count }, (_, index) => index).filter(index => words.every(word => `${index + 1} ${details?.[index]?.title ?? ""} ${details?.[index]?.section ?? ""}`.toLowerCase().includes(word)));
}
export function presentationJumpTarget(count: number, details: readonly { title?: string; section?: string }[] | undefined, query: string): number | null {
  const value = query.trim();
  if (/^[1-9]\d{0,2}$/.test(value)) { const index = Number(value) - 1; return index < count ? index : null; }
  const matches = presentationPageMatches(count, details, value);
  return value && matches.length === 1 ? matches[0] : null;
}
