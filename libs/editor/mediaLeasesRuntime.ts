/** Decoder leases used inside the canvas WebView. */
export const MEDIA_LEASES_RUNTIME = String.raw`
function leaseMedia(clips, base, extra, create, release) {
  var aliases = new Map();
  var counts = new Map();
  var used = new Set();
  for (var clip of clips) {
    var source = base.get(clip.mediaId);
    if (!source) continue;
    var index = counts.get(clip.mediaId) || 0;
    counts.set(clip.mediaId, index + 1);
    if (!index) { aliases.set(clip.id, source); continue; }
    var key = JSON.stringify([clip.mediaId, index]);
    used.add(key);
    var copy = extra.get(key);
    if (!copy) { copy = create(source); extra.set(key, copy); }
    aliases.set(clip.id, copy);
  }
  for (var pair of extra) if (!used.has(pair[0])) { release(pair[1]); extra.delete(pair[0]); }
  return aliases;
}
`;
