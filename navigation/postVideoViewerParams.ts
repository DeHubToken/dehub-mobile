/** Keep every video entry on the same seeded viewer/continuation contract. */
export function postVideoViewerParams<T>(item: T, tokenId: string | number, initialThumbnail?: string) {
  return {
    initialIndex: 0,
    initialItems: [item],
    initialThumbnail,
    feedParams: { brainrot: true, fromId: String(tokenId) },
  };
}
