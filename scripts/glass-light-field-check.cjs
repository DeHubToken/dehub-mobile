const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../components/theme/GlassLightField.tsx'), 'utf8');
  const shaderSource = source.match(/RuntimeEffect\.Make\(`([\s\S]*?)`\)/)?.[1];
  assert.ok(shaderSource, 'Missing Glass shader');
  const kit = await CanvasKitInit({
    wasmBinary: fs.readFileSync(require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm')),
  });
  const errors = [];
  const effect = kit.RuntimeEffect.Make(shaderSource, error => errors.push(error));
  assert.ok(effect, errors.join('\n'));
  const shader = effect.makeShader([1600, 1000, 0, 210 / 255, 230 / 255]);
  assert.ok(shader, 'Could not bind Glass uniforms');
  const surface = kit.MakeSurface(1600, 1000);
  assert.ok(surface, 'Could not create the light field surface');
  const paint = new kit.Paint();
  paint.setShader(shader);
  surface.getCanvas().drawPaint(paint);
  surface.flush();
  const image = surface.makeImageSnapshot();
  const pixels = image.readPixels(0, 0, {
    width: 1600, height: 1000, colorType: kit.ColorType.RGBA_8888,
    alphaType: kit.AlphaType.Unpremul, colorSpace: kit.ColorSpace.SRGB,
  });
  assert.ok(pixels, 'Could not read rendered Glass pixels');
  const green = (x, y) => pixels[(y * 1600 + x) * 4 + 1];
  assert.ok(green(200, 200) < 35, 'Negative space is too bright');
  assert.ok(green(800, 397) > 120, 'The refraction crest is missing');
  image.delete(); paint.delete(); shader.delete(); effect.delete(); surface.delete();
  console.log('Glass light field compiled and rendered with dark space and cyan crests.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
