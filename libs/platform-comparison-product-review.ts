/**
 * Hands-on product review, 2026-10-28: every catalogue row checked against each
 * competitor's live product and help centre. Fills capabilities the
 * documentation-only pass could not source. A plain id means the platform has
 * it; a trailing `?` means only partly, or through a separate app.
 * Rows not listed keep the documentation review's finding.
 */
import type { PlatformId } from './platform-comparison';

export const PRODUCT_REVIEWED_ON = '2026-10-28';

const REVIEW: Record<PlatformId, string> = {
  youtube: `
    duets face-effects collab-posts? raids live-rewind community-notes?
    images video shorts polls comments bookmarks feeds search hashtags reactions drafts scheduled translate playlists soundtracks
    live live-chat replays clips guests vertical-live? live-polls gifts gift-subs live-scheduling stream-moderation stream-branding?
    subs gated-posts tips ad-revenue cashout ad-creative? ad-targeting? ad-budget? ad-reporting?
    communities community-admin packs smart-replies?
    generate-image? generate-video generate-music timeline? captions transitions? background remix presets audio-cleanup? record learning
    stores store-branding store-product-links stream-shopping merch?
    embeds rss podcast-import assistant
    reply-control post-visibility content-warning mute-block muted-words report notifications kids themes multi-account passkeys social-login delete
    tv? music? cinema? film-search? arcade earnings-dashboard ads? feedback guide
    gallery-order edit-cover kids-publishing post-audiences? profile-search profile-content-tabs profile-pins comment-pins comment-reactions comment-reports
    adaptive-video seek-previews video-speed video-subtitles video-fullscreen video-download video-dubbing video-transcript video-segments shorts-gestures photo-shorts playback-handoff upload-queue media-processing audio-popout audio-lyrics? music-charts
    source-trim remove-middle clip-retime caption-transcription subtitle-files caption-translation stock-library
    account-export active-sessions connected-apps ai-training quiet-hours content-default autoplay-preference data-saver language-settings follow-list-privacy
    push-notifications email-notifications notification-categories notification-unread notification-digests`,
  x: `
    community-notes disappearing-messages?
    text images video shorts? polls comments quotes reposts bookmarks feeds search hashtags drafts scheduled translate
    live live-chat replays guests? stages stage-recording stage-schedule stage-captions stage-speakers stage-reactions stage-mini stage-reminders stage-recording-share
    subs gated-posts tips ad-revenue cashout ad-creative ad-targeting ad-budget ad-reporting
    communities community-admin community-private dm groups encrypted-text chat-media voice-notes calls chat-reactions message-edit message-access chat-search
    generate-image generate-video record
    embeds assistant voice-assistant
    reply-control content-warning alt-text mute-block muted-words report notifications themes multi-account passkeys social-login delete
    earnings-dashboard ads
    paste-media post-audiences? profile-content-tabs profile-pins follow-groups author-threads comment-reactions comment-reports
    adaptive-video video-speed video-subtitles video-fullscreen video-download?
    account-export active-sessions connected-apps ai-training settings-search autoplay-preference data-saver language-settings
    push-notifications email-notifications notification-categories notification-filters notification-unread
    work chat-media-gallery`,
  kick: `
    raids live-predictions
    video? shorts? live live-chat replays clips multistream? live-polls gifts gift-subs stream-moderation
    subs tips ad-revenue? cashout
    packs search notifications mute-block muted-words report social-login delete
    adaptive-video video-fullscreen push-notifications email-notifications language-settings`,
  twitch: `
    stories raids live-predictions
    video shorts? search hashtags playlists
    live live-chat replays clips guests scenes? mixer? overlays? vertical-live live-polls gifts gift-subs hype stream-moderation chat-voting stream-recap live-scheduling
    subs tips ad-revenue cashout watch-rewards
    dm packs
    mute-block muted-words report notifications themes delete
    earnings-dashboard feature-board feedback guide learning
    adaptive-video seek-previews video-speed video-subtitles video-fullscreen video-download? video-segments
    account-export connected-apps language-settings
    push-notifications email-notifications notification-categories`,
  facebook: `
    stories duets face-effects collab-posts location-map community-notes disappearing-messages
    text images video shorts polls comments reposts bookmarks feeds search hashtags reactions drafts scheduled translate playlists soundtracks
    live live-chat replays guests live-polls gifts
    subs gated-posts ppv tips ad-revenue cashout ad-creative ad-targeting ad-budget ad-reporting
    communities community-events community-admin community-private community-chat community-invites dm groups encrypted-text chat-media voice-notes chat-polls calls chat-reactions message-edit
    generate-image? record
    stores store-reviews work?
    embeds cross-post assistant
    reply-control post-visibility alt-text mute-block muted-words report notifications kids? themes multi-account passkeys social-login delete
    arcade earnings-dashboard ads feedback guide event-pages event-community
    gallery-order edit-cover post-audiences profile-content-tabs profile-pins profile-badges follow-groups comment-reactions comment-reports
    adaptive-video video-speed video-subtitles video-fullscreen video-dubbing
    account-export active-sessions connected-apps quiet-hours settings-search data-saver language-settings follow-list-privacy
    push-notifications email-notifications notification-categories notification-unread sms-notifications?
    live-scheduling stream-moderation photo-looks photo-tone chat-media-gallery`,
  instagram: `
    stories duets face-effects collab-posts location-map community-notes disappearing-messages
    text? images video shorts polls? comments reposts bookmarks feeds search hashtags drafts scheduled translate soundtracks
    live live-chat replays guests stream-moderation live-scheduling gifts?
    subs gated-posts tips? ad-revenue? cashout ad-creative ad-targeting ad-budget ad-reporting
    communities? dm groups chat-media voice-notes chat-polls calls chat-reactions message-edit message-access chat-search
    captions transitions presets background remix record
    stores store-product-links
    embeds cross-post assistant
    reply-control post-visibility alt-text mute-block muted-words report notifications kids? themes multi-account passkeys social-login delete
    earnings-dashboard ads feedback
    gallery-order edit-cover profile-content-tabs profile-pins follow-groups comment-pins comment-reactions comment-reports
    adaptive-video video-speed video-subtitles video-fullscreen video-download? video-dubbing photo-shorts
    account-export active-sessions connected-apps quiet-hours settings-search data-saver language-settings
    push-notifications email-notifications notification-categories notification-unread
    photo-looks photo-tone chat-media-gallery`,
  tiktok: `
    stories duets face-effects collab-posts? location-map community-notes
    text images video shorts polls? comments reposts bookmarks feeds search hashtags drafts scheduled translate playlists soundtracks
    live live-chat replays? guests live-polls gifts battles stream-moderation live-scheduling
    subs gated-posts ppv tips ad-revenue affiliate? cashout watch-rewards? ad-creative ad-targeting ad-budget ad-reporting
    dm groups chat-media voice-notes chat-reactions packs
    generate-image? generate-video? timeline? captions transitions background remix presets audio-cleanup record learning
    stores store-reviews store-product-links stream-shopping
    embeds assistant?
    reply-control post-visibility alt-text mute-block muted-words report notifications kids themes multi-account passkeys social-login delete
    arcade earnings-dashboard ads feedback
    gallery-order edit-cover profile-content-tabs profile-pins comment-pins comment-reactions comment-reports
    adaptive-video video-speed video-subtitles video-fullscreen video-download video-dubbing? shorts-gestures photo-shorts upload-queue
    exact-cuts clip-retime caption-transcription voice-cleanup beat-sync
    account-export active-sessions connected-apps quiet-hours data-saver language-settings follow-list-privacy
    push-notifications notification-categories notification-unread
    photo-looks`,
  rumble: `
    video comments reactions search playlists scheduled
    live live-chat replays guests multistream gifts gift-subs stream-moderation live-scheduling
    subs tips ad-revenue cashout wallet? stablecoins?
    embeds report notifications mute-block?
    earnings-dashboard ads
    adaptive-video video-speed video-fullscreen
    push-notifications email-notifications
    delete`,
  mastodon: `
    text images video audio polls comments quotes reposts bookmarks feeds search hashtags reactions scheduled? translate
    dm
    open-network activitypub third-party-clients verified-links rss embeds
    reply-control post-visibility content-warning alt-text mute-block muted-words report notifications themes multi-account? delete
    profile-content-tabs profile-pins follow-groups author-threads comment-reports
    video-fullscreen
    account-export active-sessions connected-apps content-default autoplay-preference language-settings follow-list-privacy
    push-notifications email-notifications notification-categories notification-filters notification-digests`,
  bluesky: `
    text images video comments quotes reposts bookmarks feeds search hashtags reactions? drafts translate
    dm chat-reactions message-access
    open-network third-party-clients verified-links rss embeds app-auth?
    reply-control content-warning alt-text mute-block muted-words report notifications themes multi-account delete
    profile-content-tabs profile-pins follow-groups author-threads comment-reports
    video-subtitles video-fullscreen
    account-export autoplay-preference language-settings
    push-notifications notification-categories notification-unread
    adaptive-video`,
  farcaster: `
    text images video comments quotes reposts bookmarks feeds search polls?
    communities dm groups
    tips wallet-payment?
    wallet wallet-send wallet-receive wallet-history wallet-networks wallet-stablecoins dex? launchpad?
    open-network third-party-clients embeds mini-apps app-auth app-publish app-share app-manifest verified-links?
    mute-block report notifications wallet-login
    push-notifications notification-unread`,
};

export const PRODUCT_REVIEW: Record<PlatformId, Map<string, 'yes' | 'partial'>> = Object.fromEntries(
  Object.entries(REVIEW).map(([platform, list]) => [platform, new Map(list.trim().split(/\s+/).map(token => (
    token.endsWith('?') ? [token.slice(0, -1), 'partial'] : [token, 'yes']
  ) as [string, 'yes' | 'partial']))]),
) as Record<PlatformId, Map<string, 'yes' | 'partial'>>;
