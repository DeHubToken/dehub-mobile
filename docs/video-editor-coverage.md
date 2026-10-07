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
| Stock video | Implemented | This release | Search and import video; preserve duration and licence details. |
| Stock music and sound effects | Implemented | This release | Search and import audio with its duration and provenance. |
| Project media library commands | Implemented | This release | Address local video/audio/image assets by media id. |
| Automatic captions | Implemented | This release | Local speech recognition; editable text, trims and speed respected. |
| Caption appearance | This release | This release | Classic, boxed and bold styles; no overlap or captions past clip end. |
| Subtitle file import/export | This release | This release | Editable SRT/VTT text with retained timestamps. |
| Scene/page navigation | This release | This release | Add, duplicate, navigate and delete scenes; preserve crossing source ranges and export empty appended scenes. |
| Voiceover recording | This release | This release | Record into a separate sound layer at the playhead. |
| Camera recording | This release | This release | Record and import within the editor using existing capture capabilities. |
| Screen recording | This release | OS recorder import | Browser capture; native needs supported OS recording integration. |
| Volume normalization | This release | This release | Process the trimmed, speed-adjusted clip as WAV; target -16 dB RMS, cap amplification at 6x and normalized peaks at 0.95. Clips up to ten minutes. |
| Voice enhancement / noise reduction | This release | This release | Sample the noise spectrum and reduce it with overlap-add filtering. Voice mode adds a 90 Hz high-pass filter, compression and normalization. Original media, fades and timing remain editable. |
| Automatic beat synchronization | This release | This release | Detect rhythmic onsets from up to ten minutes of trimmed, speed-adjusted music. Source-timed markers support manual snapping; sync aligns internal cuts in visible contiguous groups. Video speed changes within 0.25–4× to retain every source range. Captions, locked layers, gaps and group edges stay put. Sparse or irregular sound can return no reliable beats. |
| Automatic highlights | Gap | Gap | Reviewable source ranges with measurable selection criteria. |
| Automatic shot detection | Gap | Gap | Detect visual boundaries and offer editable cuts. |
| Video subject/background removal | Gap | Gap | Process video frames with a consistent mask in preview and export. |
| Image background removal | Implemented | Implemented | Keep transparency and original media. |
| Generated media | Implemented | Separate creator flow | Open the existing creation flow for review; retain billing consent. |
| Project save and reopen | Implemented | Implemented | Browser storage and phone storage; media survives reopening. |
| Shared projects / live collaboration | Gap | Gap | Cloud project revisions, access rules and conflict handling. |
| Video exports | MP4 / WebM | MP4 / WebM fallback | Export active layers, timing and audio correctly. |
| GIF exports | This release | This release | Looping GIF with shared timeline rendering, source offsets, transparency and the logo ending. Up to 60 seconds of content, longest edge 640 pixels, 15 fps and a 100 MiB output ceiling. GIF has no sound; MP4/WebM retains the original ending sound. |
| Separate clip downloads | This release | This release | Export the selected video cuts or every visible video cut at its original global range, with matching captions, soundtrack, source offsets and a 2.2-second branded ending per file. One file saves directly; multiple files save together in a ZIP. Archives are bounded to 512 MiB and can be cancelled. |
| Still exports | PNG / JPG | PNG / JPG | Render the selected frame without a video ending. |
| Direct DeHub posting | Implemented | Implemented | Post the edited result with correct media metadata. |
| Branded video ending | Implemented | Implemented | 2.2-second logo animation, creator dehub.io/username credit and original sound; silent sources included. |
| Reliable numeric requests | Implemented | Implemented | Exact cuts run locally; complex requests retain the existing planning route. |
| Honest operation results | This release | This release | Empty or failed operations cannot display a success confirmation. |

## Download ending

Downloads use one simple black-and-white ending. A small official icon deforms through a spin in the centre, settles into its original proportions, then reveals `dehub.io/username` underneath. The icon and credit stay together in the middle of portrait, square and landscape output. Signed-out exports show `dehub.io`.

The ending lasts 2.2 seconds. MP4/WebM retains an original short sweep and resolving chime; GIF uses the same animation without sound. The official icon and Exo font are embedded for offline native exports.

## Release evidence

- Timeline commands and default ending: web PR 2292 and mobile PR 1671, merged after cloud checks passed.
- A silent ten-second fixture exported from staging as a 12.20-second H.264 MP4 with stereo AAC sound. The closing frame contains the wordmark and signed-out `dehub.io` fallback. Creator-handle formatting and rendering are covered in both suites.
- Exact numeric requests run locally and empty backend results are reported without a success confirmation.
- Mobile publication and physical-device export verification remain separate from passing unit tests.

- Stock media: web PR 2296 and mobile PR 1676 merged with cloud checks passing. Native photo/video/audio imports retain source credits; repeated sources have independent decoders during overlaps. Physical-device verification remains pending.

- Numeric cuts verified on staging commit 1ecabeada: the exact ten one-second clip request produced ten timeline clips; one Undo restored the original and Redo restored ten. Project saved. Proof: editor-ten-clips-staging.jpg.
- Scene release: web PR 2298 and mobile PR 1677 merged with cloud checks passing. Matching source-aware duplication/deletion, scene navigation, complete timeline duration, and fenced operation-array parsing are implemented.

- Subtitle files: web PR 2300 and mobile PR 1679 merged with cloud checks passing. Import SRT/VTT as editable captions; save visible caption tracks in either format with millisecond timestamps. Android uses the folder picker; iOS uses Save to Files.
- Subtitle files verified on staging commit 2f025cde: two imported cues rendered at their timestamps, SRT and WebVTT downloads retained 2.125–3.250 and 5.000–5.750 second ranges and multiline text, and one Undo/Redo removed/restored both cues.

- Recording: web PR 2302 and mobile PR 1681 merged with cloud checks passing. Microphone and camera save recordings to the media library on a separate track at the playhead. Web also captures a chosen screen/window with available system sound. Capture stops on cancellation or leaving the panel; voiceovers are bounded to ten minutes. Live capture verification remains pending.
- Audio tools: shared worker processing creates a PCM WAV used in both preview and export. Video cleanup extracts its soundtrack and mutes the original sound; audio clips are replaced in place. Each change is one undo step. Exact cleanup requests run locally; compound requests require the updated editor-agent deployment. Web PR 2303 and mobile PR 1682 merged after cloud checks passed. The editor-agent handler was deployed from synced commit 8163d22e. Staging normalization created a WAV asset with one Undo/Redo; the downloaded 12.20-second H.264/AAC MP4 measured -16.0 dB RMS across the processed sound range and retained the ending chime. Mobile OTA run 37654241892 published the audio release after its configuration preflight passed. Physical-device verification remains pending.

- GIF downloads: a shared worker emits GIF89a with per-frame delays, transparent disposal and an infinite-loop extension. Frame encoding is acknowledged before the next frame is rendered. Cloud tests independently decode the bytes, palette, transparency, timing and dictionary resets. Web downloads a GIF; Android saves to a chosen folder in bounded chunks and iOS opens Save to Files. Web PR 2307 and mobile PR 1686 merged after cloud checks passed. The staging GIF decoded as 183 frames at 640×360, with an infinite loop and a 12.20-second duration including the DeHub ending. Mobile OTA run 37656246129 published the GIF release after its configuration preflight passed. Physical-device verification remains pending.

- Clip downloads: range/audio math and the archive writer are shared across web and mobile. Cloud tests cover ten distinct one-second ranges, source trims and playback speed, original caption times, partial fade envelopes, UTF-8 names, independent ZIP directory/CRC parsing, bounded reads, cancellation and partial-file cleanup. Web PR 2309 and mobile PR 1687 merged after cloud checks passed. Staging downloaded ten independently readable 640×360 H.264/AAC files, each 3.2 seconds (one second of content plus the ending). ZIP CRC and directory checks passed; sampled pictures matched the expected source positions 0.25 through 9.25 seconds. Native publication remains pending.

- Icon profile credits: web PR 2310 and mobile PR 1688 merged after cloud checks passed. Both renderers use the official mark cropped to its visible proportions and `dehub.io/username` credits. The web release appeared on staging. Mobile publication run 37661758610 was dispatched; downloaded-file and physical-device verification remain pending.

- Centred ending: the shared renderer uses a small white icon, an elastic spin and a masked profile-credit reveal on black. Tests cover centred safe placement across aspect ratios, deformation before settling, reveal order, sound bounds and identical native-runtime output. Web PR 2313 and mobile PR 1691 merged after cloud checks passed. Staging loaded web commit 6ec6c989 and exported the new ending in a 12.2-second H.264/AAC file; the ending sound measured a -21.35 dB peak. The signed-out credit is `dehub.io`. Native publication run 37664006053 is queued; signed-in and physical-device verification remain pending.

- Beat synchronization: controls, manual marker snapping and direct commands use the shared worker and alignment reducer. Cloud checks, staging music verification and native publication remain pending.
