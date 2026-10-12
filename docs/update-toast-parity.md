# Update toast appearance

The web new-version notice uses the same glass appearance for Refresh and
Changes at desktop and phone widths. Both actions opt out of element-specific
theme overrides so a native button and a link retain identical materials.

The native app does not render this action pair. `libs/otaUpdates.ts` downloads
updates for the next cold launch, while `components/UpdateGate.tsx` handles store
updates. Its Update and Not now actions have distinct purposes and retain their
existing appearance.
