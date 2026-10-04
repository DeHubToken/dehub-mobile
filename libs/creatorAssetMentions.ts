type AssetMentionReference = { key: string; kind: 'image' | 'video' };

/** Keep numbered prompt references attached to the same asset after removal. */
export function remapAssetMentions(prompt: string, previous: AssetMentionReference[], next: AssetMentionReference[]): string {
  const tags = (assets: AssetMentionReference[]) => {
    let images = 0;
    let videos = 0;
    return assets.map(asset => ({ key: asset.key, tag: asset.kind === 'image' ? `Image${++images}` : `Video${++videos}` }));
  };
  const previousTags = new Map(tags(previous).map(asset => [asset.tag, asset.key]));
  const nextTags = new Map(tags(next).map(asset => [asset.key, asset.tag]));
  return prompt.replace(/(^|[^\w@])@(Image|Video)(\d+)\b/gi, (match, prefix: string, kind: string, number: string) => {
    const tag = `${kind.toLowerCase() === 'image' ? 'Image' : 'Video'}${number}`;
    const key = previousTags.get(tag);
    if (key === undefined) return match;
    const replacement = nextTags.get(key);
    return replacement ? `${prefix}@${replacement}` : prefix;
  });
}
