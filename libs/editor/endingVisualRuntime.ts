export const ENDING_VISUAL_RUNTIME = String.raw`/** Compares the icon area separately from the surrounding black canvas. */
function endingPixelsMatch(actual, expected, width, height) {
  const unit = Math.min(width, height);
  let error = 0, count = 0, bright = 0, background = 0, black = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const a = (actual[p] + actual[p + 1] + actual[p + 2]) / 3;
    const e = (expected[p] + expected[p + 1] + expected[p + 2]) / 3;
    if (Math.abs(x - width / 2) < unit * 0.105 && y > height / 2 - unit * 0.13 && y < height / 2 + unit * 0.075) {
      error += Math.abs(a - e) / 255; count++; if (a > 120) bright++;
    } else if (Math.abs(x - width / 2) > unit * 0.39 || y < height / 2 - unit * 0.16 || y > height / 2 + unit * 0.18) {
      background++; if (a < 16) black++;
    }
  }
  return count > 0 && bright / count > 0.03 && error / count < 0.065 && background > 0 && black / background > 0.985;
}

async function legacyEndingBoundary(video, logo, draw, signal) {
  if (!Number.isFinite(video.duration) || video.duration <= 2.25 || video.videoWidth < 2 || video.videoHeight < 2) return null;
  const unit = Math.min(video.videoWidth, video.videoHeight);
  const width = Math.max(2, Math.round(video.videoWidth * 360 / unit));
  const height = Math.max(2, Math.round(video.videoHeight * 360 / unit));
  const actual = document.createElement("canvas"), expected = document.createElement("canvas");
  actual.width = expected.width = width; actual.height = expected.height = height;
  const a = actual.getContext("2d", { willReadFrequently: true }), e = expected.getContext("2d", { willReadFrequently: true });
  const boundary = video.duration - 2.2;
  for (const time of [0.5, 1.6]) {
    signal?.throwIfAborted();
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer); video.removeEventListener("seeked", seeked); video.removeEventListener("error", failed);
        signal?.removeEventListener("abort", aborted); error ? reject(error) : resolve();
      };
      const seeked = () => finish();
      const failed = () => finish(new Error("Ending frame did not load"));
      const aborted = () => finish(new DOMException("Download cancelled", "AbortError"));
      const timer = setTimeout(failed, 10000);
      video.addEventListener("seeked", seeked, { once: true }); video.addEventListener("error", failed, { once: true });
      signal?.addEventListener("abort", aborted, { once: true });
      video.currentTime = boundary + time;
      if (signal?.aborted) aborted();
    });
    a.drawImage(video, 0, 0, width, height);
    draw(e, width, height, time, "", logo);
    if (!endingPixelsMatch(a.getImageData(0, 0, width, height).data, e.getImageData(0, 0, width, height).data, width, height)) return null;
  }
  return boundary;
}`;
