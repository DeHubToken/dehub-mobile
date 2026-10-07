export const ENDING_FILE_RUNTIME = String.raw`
function endingBytes(contentDuration, format) {
  if (!Number.isFinite(contentDuration) || contentDuration <= 0) throw new Error("Invalid content duration");
  var offset = format === "mp4" ? 24 : 2;
  var bytes = new Uint8Array(offset + 24), view = new DataView(bytes.buffer);
  if (format === "mp4") {
    view.setUint32(0, bytes.length); bytes.set([117,117,105,100],4);
    bytes.set([93,210,108,48,154,38,75,163,167,60,219,62,157,70,52,17],8);
  } else bytes.set([236,152]);
  bytes.set([68,69,72,85,66,79,85,84,82,79,48,49],offset);
  view.setFloat64(offset+12,contentDuration); bytes.set([50,46,50,0],offset+20);
  return bytes;
}
function readEndingBoundary(tail, sourceDuration) {
  if (!Number.isFinite(sourceDuration)) return null;
  for (var size of [48,26]) {
    if (tail.length < size) continue;
    var bytes=tail.subarray(tail.length-size),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=size===48?24:2;
    if (size===48) {
      if(view.getUint32(0)!==48 || [117,117,105,100,93,210,108,48,154,38,75,163,167,60,219,62,157,70,52,17].some(function(n,i){return bytes[i+4]!==n;})) continue;
    } else if(bytes[0]!==236 || bytes[1]!==152) continue;
    if([68,69,72,85,66,79,85,84,82,79,48,49,0,0,0,0,0,0,0,0,50,46,50,0].some(function(n,i){return (i<12||i>=20)&&bytes[offset+i]!==n;})) continue;
    var content=view.getFloat64(offset+12);
    if(Number.isFinite(content)&&content>0&&Math.abs(sourceDuration-content-2.2)<=0.12) return content;
  }
  return null;
}
function stampEnding(blob, contentDuration, format) {
 return new Blob([blob,endingBytes(contentDuration,format)],{type:blob.type});
}
`;
