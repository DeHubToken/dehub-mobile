# Video editing coverage

Reference set: [Canva video editor](https://www.canva.com/video-editor/), [video tools](https://www.canva.com/video-editor/ai/), [Beat Sync](https://www.canva.com/features/beat-sync/), and [mobile editing](https://www.canva.com/video-editor/mobile-app/), reviewed 7 October 2026.

“Implemented” describes code support, not a blanket claim of feature parity. Each release still needs cloud checks, staging verification, and native publication. Work through the gaps in both repositories; do not advertise an unsupported operation in the client's capability list.

| Capability | Web | Mobile | Acceptance condition / remaining work |
| --- | --- | --- | --- |
| Precise splitting | Implemented | Implemented | Cut a ten-second source into ten distinct one-second clips; retain source offsets. |
| Equal segmentation | Implemented | Implemented | Count-only and duration-only requests; preserve unrequested footage. |
| Trim source ranges | Implemented | Implemented | Keep seconds 2–7 without duplicating the first frame. |
| Remove middle sections | Implemented | Implemented | Preserve both sides and close the cut on the track. |
| Reorder and sequence | Implemented | Implemented | Requested sequence follows clip ids and track boundaries. |
| Gap closing | Implemented | Implemented | Pack selected clips without moving locked layers. |
| Repeat clips | Implemented | Implemented | Consecutive copies without a position nudge. |
| Playback speed | Implemented | Implemented | Preserve the source range and retime duration and motion. |
| Multiple tracks | Implemented | Implemented | Video, sound, text, overlays, independent muting and hiding. |
| Extract soundtrack | Implemented | Implemented | Create an editable audio layer and mute the source video. |
| Volume and fades | Implemented | Implemented | Preview and export have the same gain envelope. |
| Transitions | Implemented | Implemented | Fades, slides and wipes; independently seek repeated sources during overlap. |
| Crop, flip, rotate, fit | Implemented | Implemented | Same geometry in preview and export. |
| Canvas resizing | Implemented | Implemented | Landscape, portrait, square and 4:5; preserve composition. |
| Filters and colour adjustment | Implemented | Implemented | Brightness, contrast, saturation, warmth and vignette. |
| Text styling | Implemented | Implemented | Fonts, alignment, outlines, backgrounds and spacing. |
| Entrance and exit animations | Implemented | Implemented | Timed independently of clip speed and trimming. |
| Custom motion | Implemented | Implemented | Editable keyframes, easing and recorded placement gestures. |
| Shapes and freehand drawing | Implemented | Implemented | Vector layers render identically in downloads. |
| Starter templates | Implemented | Implemented | Replace a design intentionally, then allow editing. |
| Brand fonts, colours and logo | Implemented | Implemented | Apply the saved brand kit without damaging existing layers. |
| Stock photos | Implemented | Implemented | Search, import and retain source licence information. |
| Stock video | Implemented | Gap | Add video/audio imports and the corresponding client capability. |
| Stock music and sound effects | Implemented | Gap | Import usable audio with its duration and provenance. |
| Project media library commands | Implemented | Gap | Address local video/audio/image assets by media id. |
| Automatic captions | Implemented | This release | Local speech recognition; editable text, trims and speed respected. |
| Caption appearance | This release | This release | Classic, boxed and bold styles; no overlap or captions past clip end. |
| Subtitle file import/export | Gap | Gap | Editable SRT/VTT text with retained timestamps. |
| Scene/page navigation | Implemented | Gap | Add, duplicate, navigate and move scene content. |
| Voiceover recording | Gap | Gap | Record into a separate sound layer at the playhead. |
| Camera recording | Gap | Gap | Record and import within the editor using existing capture capabilities. |
| Screen recording | Gap | Platform-specific gap | Browser capture; native needs supported OS recording integration. |
| Volume normalization | Gap | Gap | Measure the audible source range and apply bounded gain. |
| Voice enhancement / noise reduction | Gap | Gap | Apply and preview actual audio processing. |
| Automatic beat synchronization | Gap | Gap | Detect beats from sound and align cuts to detected timestamps. |
| Automatic highlights | Gap | Gap | Reviewable source ranges with measurable selection criteria. |
| Automatic shot detection | Gap | Gap | Detect visual boundaries and offer editable cuts. |
| Video subject/background removal | Gap | Gap | Process video frames with a consistent mask in preview and export. |
| Image background removal | Implemented | Implemented | Keep transparency and original media. |
| Generated media | Implemented | Separate creator flow | Open the existing creation flow for review; retain billing consent. |
| Project save and reopen | Implemented | Implemented | Browser storage and phone storage; media survives reopening. |
| Shared projects / live collaboration | Gap | Gap | Cloud project revisions, access rules and conflict handling. |
| Video exports | MP4 / WebM | MP4 / WebM fallback | Export active layers, timing and audio correctly. |
| GIF exports | Gap | Gap | Animated export with suitable size, frame rate and transparent handling. |
| Separate clip downloads | Gap | Gap | Export requested ranges as individual named files. |
| Still exports | PNG / JPG | PNG / JPG | Render the selected frame without a video ending. |
| Direct DeHub posting | Implemented | Implemented | Post the edited result with correct media metadata. |
| Branded video ending | Implemented | Implemented | 2.2-second logo animation, creator @username and original sound; silent sources included. |
| Reliable numeric requests | This release | This release | Exact cuts run locally; complex requests retain the existing planning route. |
| Honest operation results | This release | This release | Empty or failed operations cannot display a success confirmation. |

## Download ending concepts

All concepts end with the existing DeHub wordmark and the creator's @username. Sound is original and synthesized locally. The shipped default is Signal pulse.

1. **Signal pulse:** wordmark reveals horizontally, a teal line pulses, two clear notes resolve.
2. **Glass badge:** a translucent creator badge turns toward the viewer, with a soft glass tap.
3. **Orbit:** small points circle the logo and settle under the handle, with an airy sweep.
4. **Neon trace:** a thin light draws the mark, followed by the handle and a bright electronic ping.
5. **Cinema stamp:** the mark lands as a clean closing credit, with a warm low impact.
6. **Particle gather:** scattered particles form the logo while the handle fades in, with a rising shimmer.
7. **Wave reveal:** a sound wave passes across the mark and becomes an underline, with a short bass note.
8. **Creator card:** the username slides into a compact signature card, with a crisp click and chime.
9. **Glitch lock:** two brief offsets snap into the clean mark and handle, with a restrained digital snap.
10. **Spotlight:** a moving pool of light reveals the logo and creator credit, with a soft cinematic swell.

## Release evidence

- Timeline commands and default ending: web PR 2292 and mobile PR 1671, merged after cloud checks passed.
- Web staging serves commit `29f3a5e970dd6b98d4dce1f21f8ec13f016c3fe5`.
- A silent ten-second fixture exported from staging as a 12.20-second H.264 MP4 with stereo AAC sound. The closing frame contains the wordmark and signed-out `dehub.io` fallback. Creator-handle formatting and rendering are covered in both suites.
- The first live cut request exposed an empty backend operation list despite a success reply. Local numeric handling and truthful empty-result reporting address this in the next release. Do not mark this live test passed until the actual timeline contains ten clips.
- Mobile publication and physical-device export verification remain separate from passing unit tests.
