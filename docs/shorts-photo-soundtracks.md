# Musical photos in Shorts

The shared Shorts service interleaves video results with public image posts carrying valid soundtrack tags. Home carousels and the full viewer use the same service. Continuation remains available while either source has more pages; a filtered short page no longer ends the feed early.

Each post fills one screen. Up/down changes posts. Only multi-image posts accept sideways swipes, using horizontal activation and vertical failure thresholds against the native vertical pager. Photos retain their position while the post remains mounted. One soundtrack player belongs to the post, so changing photos cannot restart the music. The existing AVPlayer/ExoPlayer playback lifecycle handles the audio-only source, mute, speed, seeking and focus. Photo posts have no video view or picture-in-picture button. Tiles show a music marker and photo count; captions strip soundtrack metadata and display the track credit. Failed soundtracks offer retry.

Eligibility excludes paid, hold-gated, subscriber, bounty and non-safe rated photos because the Shorts viewer has no content gate. Following/category filters apply to both sources. Random video order keeps its server shuffle seed; photos use stable newest-first pagination.

Validation includes soundtrack normalization, eligibility, mixed-feed ordering, filter forwarding and continuation when only photos have more pages. Local TypeScript reports existing missing expo-speech, expo-screen-capture and expo-haptics dependencies; CI installs the declared dependencies. Native touch arbitration and audio-only playback require verification in an installed build after OTA publication.
