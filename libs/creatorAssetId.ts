/** Legacy histories retain their original library IDs; new turns can hold multiple results. */
export function creatorAssetId(requestId: string, resultId: string | undefined, kind: string, scheme?: 'results-v1'): string {
  return `native-${scheme === 'results-v1' ? resultId ?? requestId : requestId}-${kind}`;
}
