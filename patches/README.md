Patches in this folder are applied by patch-package during postinstall.

`@shopify+flash-list+2.3.2.patch` preserves the native row-positioning container
with `collapsable={false}`. Flattening that container can discard the profile
header offset on Android, leaving the first post underneath the header. Both
the source and distributed JavaScript entry are patched. Track upstream
https://github.com/Shopify/flash-list/issues/2399 before removing this patch.

The same patch keeps a list's last real layout while it sits under a
`display: none` ancestor (Home hides off-screen tab pages that way). Hidden,
the list measures 0x0; laying out at that size zeroed every row, and each swipe
back in re-measured the page, which made posts jump in size.

If a patch fails to parse, temporarily disable it by renaming the file extension (e.g., add `.disabled`) and re-run install. Then recreate the patch against the current dependency version if needed.

`expo-image+55.0.11.patch` adds `setHardwareBitmapsEnabled` (Android). When on,
Glide decodes pictures as hardware bitmaps (Android 9+, no blur), so a
scrolling frame no longer uploads each new picture on the render thread. It
defaults to off; `libs/hardwareImageDecode.ts` turns it on for a share of
installs (`HARDWARE_IMAGE_ROLLOUT_PERCENT`), and an update setting that back to
0 switches it off. Recreate it when expo-image is upgraded.
