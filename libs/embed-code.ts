/**
 * The code a site pastes to embed a post. dehub.io/app/post/<id>/embed is
 * served by the web worker (dehubweb server/post-embed.js), and embed.js fits
 * the frame to the post. Kept byte-for-byte the same as the web's
 * embedSnippet so an embed copied on either platform is the same embed.
 */
export function postEmbedCode(tokenId: string | number): string {
  const id = Number(tokenId);
  return `<iframe src="https://dehub.io/app/post/${id}/embed" class="dehub-embed" style="max-width: 100%; border: 0" width="550" height="480" allowfullscreen="allowfullscreen" allow="fullscreen; picture-in-picture" loading="lazy"></iframe><script src="https://dehub.io/embed.js" async="async"></script>`;
}
