# Image-post music audit — 27 September 2026

The image soundtrack badge previously advertised playback before native confirmation, ignored feed visibility and navigation focus, had no error recovery, and could start after an asynchronous audio-session setup had been cancelled. Its small control lacked an accessibility label. Track parsing also prefixed full URLs with the CDN host and could not preserve delimiters in metadata.

The updated control starts on a tap, reflects native status, permits cancellation during loading, offers retry after failure or timeout, yields audio focus, and pauses on scroll-away, navigation, backgrounding, source change, or unmount. Gated image posts do not expose the soundtrack. The image viewer has the same control. Sound-picker previews participate in audio focus. Track metadata supports relative and absolute HTTP(S) URLs and escaped title/creator fields while retaining legacy tags.

Targeted tests cover playback confirmation, cancellation during audio setup, visibility, timeout/retry, audio focus, and metadata compatibility. Web changes include equivalent controls plus missing feed mapping, preservation on edit, and fullscreen control of the same audio element.

Native fullscreen still pauses the feed and requires a new tap in the viewer; uninterrupted native handoff is not implemented. Physical iOS/Android verification and OTA publication are distinct from source tests and merging. Historical malformed tags cannot be reconstructed reliably without the original metadata.
