# Media editor

The mobile side of the web editor at `dehub.io/editor`. Same project format,
same drawing code, so a design looks the same whichever app made it.

Entry: Creator screen → Editor (`ScreenNames.MediaEditor`, optional
`{ projectId }`).

## How it fits together

| Piece | File | Web counterpart |
| --- | --- | --- |
| Project format | `libs/editor/types.ts` | `src/lib/editor/types.ts` (identical copy) |
| Edits (add, layer order, placement) | `libs/editor/project.ts` | `src/store/editorStore.ts` |
| Drawing | `libs/editor/canvasHtml.ts` | `src/lib/editor/render.ts` + `animationPresets.ts` (line-for-line port) |
| Filters, fonts | `libs/editor/filterPresets.ts`, `fonts.ts` | `filterPresets.ts`, `googleFonts.ts` |
| Storage | `libs/editor/storage.ts` (files under `documentDirectory/editor/`) | IndexedDB |
| Canvas + gestures | `components/editor/EditorCanvas.tsx` | `components/editor/Preview/Compositor.tsx` |
| Controls | `components/editor/EditorPanels.tsx` | `components/editor/inspector/LayerSection.tsx` |

**Why the canvas is a WebView.** Installed apps take JS over the air (see
`.github/workflows/ota.yml`) but cannot gain a native module that way; a new
native drawing library would crash every binary already out there. The WebView
is already in the app and, on Android, is the same Chromium canvas the web
draws with. The page reports each layer's box back after every frame, and hit
testing and the selection box use those boxes, so handles never disagree with
the pixels.

**Keeping the two apps in step.** When the web changes `types.ts` or how
`render.ts` draws a clip, the same change goes into `libs/editor/types.ts` and
`libs/editor/canvasHtml.ts`. To prove parity after a change: transpile the web's
`render.ts` + `animationPresets.ts` into a page, load `EDITOR_CANVAS_HTML` in an
iframe beside it, draw the same snapshot in both and diff the pixels. At the
time of writing a snapshot covering crop, cover fit, filters, rotation, flip,
rounded corners, shadow, and styled text with label, outline, underline and an
entrance animation differed by at most 2/255 per channel (PNG rounding). With
`ctx.filter` unavailable (older iOS WebKit) the hand-rolled colour maths lands
within 7/255.

## Rules the format imposes

- Track order is draw order. Every new layer goes on a track above the others,
  reusing a free track only when nothing sits above it.
- Text keeps its anchor in `x`/`y` and its size in `fontSize`; media keeps
  placement in `transform`. `placementPatch` does the split, as on the web.
- New layers start at 0 and last `max(5s, timeline end)`, so a layer added to a
  web project with a timeline shows for the whole of it.
- The still editor shows and exports the frame at `STILL_TIME` (1s), after the
  web's text fade-in and default entrance animations have settled.

## Phases

1. **Photos (shipped first).** New design by page shape, pictures and text as
   layers, drag / pinch / rotate with centre snapping, filters, adjustments,
   crop, corners, shadow, opacity, flip, fit/fill, layer order, text font,
   colour, style, label, outline. Undo/redo, autosave, PNG/JPG export to Photos
   or straight into a new post.
2. **Designs across devices.** Both apps keep projects on the device today, so
   the same design cannot yet move between them. Sync the snapshot to a table
   keyed by wallet and upload pictures to the `editor-assets` bucket the web's
   `cloudMedia.ts` already uses; `mediaId` becomes the asset id. Backend changes
   go through the Lovable agent.
3. **Short video.** Add video clips to the same page (`<video>` in the WebView,
   fed from a local file), a trim strip for the one-track case, and the web's
   entrance/exit animations and transitions. Export through the WebView's
   `MediaRecorder` on the canvas stream first; fall back to a server render if
   devices struggle.
4. **Web-only features after that:** templates, free-asset library, AI
   generation panel, multi-track timeline.

## Things to know

- A web project opened here draws pictures it has on this phone; ones it does
  not have are left out and a notice says so.
- Pictures are stored at most 2560 px on the long edge; PNGs keep transparency.
- Text uses Google Fonts loaded in the WebView. Offline, the fallback font is
  used and the export still completes (it waits at most 3s for fonts).
