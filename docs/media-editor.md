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
   **Parity round (after the web's editor overhaul):** shapes (8 kinds), freehand
   Draw (a "path" shape), Layers list with hide/lock/restack, 16 blend modes,
   warmth/tint/vignette grading and Auto enhance (picture measured inside the
   WebView). `types.ts` is back to identical with the web, and `canvasHtml.ts`
   ports the web's shape, blend, hidden-layer and grade code; the web also
   dropped its automatic 0.3s text fade-in, so the page did too.
   **AI, templates, brand kit:** the AI chat calls the same `editor-agent` edge
   function as the web; `libs/editor/agent.ts` applies its ops to the snapshot
   (one undo). Templates are the web's op lists (`templates.ts`), stock photos
   come from `free-stock-assets` and are downloaded on the phone (`stock.ts`),
   and the brand kit lives in AsyncStorage (`brand.ts`). Captions, pages and AI
   generation stay web-only until video lands; the agent says so when asked.
   **Remove background** runs on the phone inside the canvas WebView: the
   web's lite model (MODNet, 6.6 MB, transformers.js from jsdelivr) in a
   worker. The cut-out is saved as a new PNG picture and swapped onto the layer
   (one undo); the AI's `remove_background` does the same.
2. **Designs across devices.** Both apps keep projects on the device today, so
   the same design cannot yet move between them. Sync the snapshot to a table
   keyed by wallet and upload pictures to the `editor-assets` bucket the web's
   `cloudMedia.ts` already uses; `mediaId` becomes the asset id.
3. **Video (shipped).** Videos and sounds are copied into editor storage as
   picked and handed to the canvas page in 1 MB base64 pieces, each acked
   (`mediaBegin` / `mediaChunk` / `mediaEnd`), where they play from blob URLs
   so the canvas stays exportable. The page runs the playback clock and reports
   the playhead (`time`, `ended`); transitions are the web's `computeRenderOps`
   ported into the page. `libs/editor/timeline.ts` holds the edits (videos back
   to back with ripple trims, reorder by drag, split, speed, transitions) and
   `components/editor/Timeline.tsx` the strip: fixed playhead, drag to scrub,
   pinch to zoom, handles to trim, hold to move. Export is the web's exporter
   inside the page: WebCodecs H.264 + AAC into mp4-muxer (jsdelivr), frame by
   frame; phones without WebCodecs audio (iOS before 26) record the timeline in
   real time with MediaRecorder. The file comes back in acked pieces and is
   written with the expo-file-system File handle. An export with no progress
   for 45 s is abandoned (the page pauses encoders when the app is in the
   background).
4. **Next:** captions and the AI's timing and audio ops on the phone, pages,
   multi-select.

## Things to know

- A web project opened here draws pictures it has on this phone; ones it does
  not have are left out and a notice says so.
- Pictures are stored at most 2560 px on the long edge; PNGs keep transparency.
- Text uses Google Fonts loaded in the WebView. Offline, the fallback font is
  used and the export still completes (it waits at most 3s for fonts).
