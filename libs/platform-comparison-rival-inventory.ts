/**
 * Rival-first feature inventory, 2026-10-28. Built from each competitor's own help
 * centre, creator, premium, ads and developer pages, then every brand (DeHub too)
 * was ticked against the full list. Rows that DeHub's own catalogue already covers
 * are left out here, so nothing is counted twice.
 *
 * Each line: `id | Feature | marks`. Marks are yt x ki tw fb ig tt ru ma bs fc dh.
 * A trailing `?` means only partly, or through a separate app. A competitor that is
 * not listed stays unconfirmed (never a cross). DeHub not listed means DeHub lacks it.
 */
import type { PlatformId } from './platform-comparison';

export const RIVAL_INVENTORY_REVIEWED_ON = '2026-10-28';

export const RIVAL_INVENTORY = `
# Posts and discovery
mentions | @mentions in posts | yt x fb ig tt ma bs fc dh
edit-posts | Edit a published post | yt x fb ig ma fc? dh
edit-history | Public edit history | x fb ma
carousels | Multi-photo carousels | yt x fb ig tt ma bs fc dh
mixed-carousels | Mixed photo and video carousels | x fb ig ma
close-friends | Close Friends sharing list | fb ig
story-highlights | Story highlights on profiles | fb ig
story-stickers | Interactive story stickers | fb ig
question-box | Question boxes for followers | ig tt
quiz-posts | Quiz posts | yt ig
profile-notes | Short status notes | fb ig
add-yours | Chain prompts such as "Add Yours" | fb ig tt
premieres | Video premieres with live chat | yt fb ru? dh?
view-counts | Public view counts | yt x fb ig tt tw ki ru dh
hide-like-counts | Hide like and view counts | fb ig x? yt?
save-collections | Saved-post collections and folders | yt x fb ig tt dh
trending | Trending and explore pages | yt x ki tw ig tt ru ma bs dh
advanced-search | Advanced search filters and operators | yt x fb tt ma bs dh
saved-searches | Saved searches | x
not-interested | "Not interested" feedback on recommendations | yt x fb ig tt tw bs
reset-recommendations | Reset your recommendations | yt? ig tt
why-am-i-seeing | "Why am I seeing this" explanations | fb ig tt x?
chronological-feed | Chronological following feed | yt x fb ig ma bs fc dh
topic-tuning | Tune feed topics yourself | ig tt bs? dh?
visual-search | Visual search inside photos and video | yt
sound-pages | Sound pages showing every post using a sound | yt ig tt fb?
use-sound | Reuse another post's sound | yt fb ig tt
green-screen | Green screen remix | yt tt ig? dh
reel-templates | Reusable video templates | ig tt yt? fb?
share-to-dm | Share posts into private messages | x fb ig tt bs fc? dh
video-replies | Reply to a comment with a video | yt ig tt
comment-gifs | GIF and sticker comments | x fb ig tt? dh
comment-sorting | Sort comments by top or newest | yt fb tt? ma? dh
creator-hearts | Creator hearts on comments | yt tt ig?
comment-summaries | AI summaries of comment threads | yt fb?
auto-alt-text | Automatic image descriptions | fb ig
tag-people | Tag people in photos | x fb ig tt
nearby-feed | Nearby and local feed | tt fb?
trial-posts | Trial posts shown to non-followers first | ig
blend-feed | Shared feed with a friend | ig
hashtag-follow | Follow hashtags in your feed | ma bs?
post-language | Tag a post's language | ma bs
featured-hashtags | Featured hashtags on profiles | ma
hide-replies | Hide replies on your own post | yt x fb ig tt bs ma?
detach-quotes | Remove your post from someone's quote | bs ma?
thread-mute | Mute a conversation's notifications | x fb ig ma bs
familiar-followers | "Followed by people you know" | x fb ig ma bs dh
post-reminders | Reminder posts for upcoming events | fb ig yt?
memories | On This Day memories | fb
account-about | About this account details | x ig fb? tt?
collab-playlists | Collaborative playlists | yt
hype-small-creators | Fans promote smaller creators | yt dh?
clickable-timestamps | Clickable timestamps in comments | yt tw? fb?
activity-log | Your activity log of likes and comments | yt fb ig tt x? dh
life-events | Life events on profiles | fb

# Profiles and identity
verified-badges | Verification badges | yt x ki tw fb ig tt bs? ma?
paid-verification | Paid verification subscription | x fb ig
org-badges | Organisation and affiliate badges | x bs?
domain-handles | Use your own domain as your handle | bs ma? fc?
username-change | Change your username | yt x ki tw fb ig tt ma bs fc dh
profile-links | Several links in a bio | yt fb ig tt ma bs? dh
profile-video | Video profile picture | fb tt?
pronouns | Pronouns field | ig fb tw dh
profile-qr | Profile QR codes | fb ig tt x? yt?
profile-views | See who viewed your profile | tt
channel-trailer | Channel trailer for new visitors | yt tw
profile-sections | Customisable profile sections | yt tw fb? dh?
profile-song | Profile song | ig tt?
professional-mode | Creator or professional account mode | fb ig tt x?
memorialisation | Memorialised accounts | fb ig
legacy-contact | Legacy contact or inactive account manager | fb yt
account-migration | Move your followers to another server | ma bs
avatars | 3D avatars and avatar stickers | fb ig
custom-app-icons | Custom app icons | x? tt?
starter-packs | Starter packs of accounts to follow | bs
import-follows | Import follow and block lists from a file | ma bs? dh

# Live video and audio
mobile-live | Go live from a phone | yt x ki tw fb ig tt ru dh
rtmp-ingest | Stream from OBS with a stream key | yt x ki tw fb ig? tt? ru dh
screen-share-live | Share your screen on stream | yt tw? dh
low-latency | Low-latency live mode | yt tw ki? dh
live-1440p | 1440p or 4K live streams | yt tw? ki?
channel-points | Channel points rewards | tw ki?
drops | Game drops for watching | tw ki?
paid-chat | Paid highlighted chat messages | yt ru fb? tt?
super-stickers | Paid animated stickers in chat | yt
chat-modes | Slow, followers-only and emote-only chat | yt tw ki fb? dh
automod | AutoMod chat filtering | yt tw ki? tt? dh?
blocked-terms | Blocked chat terms | yt tw ki fb? tt dh
shield-mode | One-tap harassment lockdown for streams | tw
chat-replay | Chat replay on past streams | yt tw ki? fb?
stream-markers | Stream markers for editing later | tw yt?
stream-health | Stream health and bitrate monitor | yt tw ki? fb?
live-ads | Ad breaks during streams | yt tw ki?
shoutouts | Shoutouts to other streamers | tw
watch-parties | Watch parties | tw? fb?
live-qa | Live Q&A | yt ig tt fb?
live-goals | Live goals for gifts or subscribers | tw tt yt? dh
stream-categories | Stream categories and tags | yt? ki tw tt? ru? dh
mature-streams | Mature or age-restricted streams | yt tw ki dh
member-only-live | Subscriber-only live streams | yt ig tw? dh
charity-streams | Charity fundraising streams | yt tw fb tt?
stream-together | Shared chat during collab streams | tw tt?
mod-view | Moderator dashboard view | tw yt?
ban-evasion | Ban-evasion detection | tw
unban-requests | Unban requests | tw ki?
live-redirect | Send viewers to another live channel | yt tw ki?
live-trim | Trim a past broadcast | yt tw ki? fb?
gifter-leaderboard | Top gifter leaderboards | tw ki tt dh
watch-streaks | Watch streaks | tw
live-transcript | Live captions on video streams | yt fb? tw?
live-multiview | Watch several streams at once | ki? tw?
power-ups | Paid chat effects and power-ups | tw tt?

# Playback and uploads
pip | Picture-in-picture | yt x? ki tw fb tt dh
background-play | Background playback | yt tw? ru? dh?
casting | Cast to TV with Chromecast or AirPlay | yt tw ki? fb? ru?
tv-apps | Smart TV apps | yt tw tt ru ki?
console-apps | Game console apps | yt tw
vr-app | VR headset app | yt fb?
uhd-playback | 4K playback | yt fb? x?
hdr-video | HDR video | yt ig? fb?
spatial-video | 360° and VR video | yt fb
loop-playback | Loop a video | yt ig tt dh
sleep-timer | Sleep timer | yt
stable-volume | Stable volume during playback | yt
ambient-mode | Ambient lighting around the player | yt
most-replayed | Most-replayed heatmap | yt
jump-ahead | Skip to the best part | yt
auto-scroll | Auto-scroll through short videos | tt fb ig?
clear-display | Clear-display mode | tt
theater-mode | Theatre mode | yt tw ki
mini-player | Video mini-player while browsing | yt tw ki fb? dh?
resume-playback | Resume where you left off | yt tw? ki?
watch-history | Watch history with search and pause | yt tt fb? dh
up-next | Autoplay up next | yt tw? fb? ru? dh
end-screens | End screens and info cards | yt
long-uploads | Uploads longer than three hours | yt fb tw x? ru
video-quality-upload | 4K and 8K uploads | yt fb? ru?

# Creator analytics
realtime-analytics | Real-time view analytics | yt tw fb tt? ki? dh?
audience-demographics | Audience age, gender and location | yt fb ig tt tw?
audience-retention | Audience retention graphs | yt fb ig tt
traffic-sources | Traffic source analytics | yt fb ig tt tw
impressions-ctr | Thumbnail impressions and click-through rate | yt
ab-testing | Thumbnail and title A/B tests | yt
audience-active-times | When your audience is online | yt fb ig tt
follower-growth | Follower growth charts | yt x fb ig tt tw ki? dh
typical-performance | Compare a post with your usual performance | yt ig tt?
search-insights | Search terms that found your content | yt tt
content-ideas | Content idea suggestions | yt tt?
post-analytics | Per-post analytics for every account | yt x fb ig tt tw?
analytics-export | Export analytics data | yt x fb tw? dh?
studio-app | Separate creator studio app | yt tt fb
comment-inbox | One inbox for every comment | yt fb ig? tt?
team-roles | Team access and roles for a channel | yt x fb ig tw tt ki?
copyright-matching | Automatic copyright matching | yt fb ig
copyright-claims | Copyright claim dashboard | yt fb tw?
likeness-detection | AI likeness detection | yt
studio-trim | Trim and blur after publishing | yt
shorts-from-long | Turn long videos into short clips | yt ru?
channel-watermark | Channel watermark on videos | yt

# Creator income
membership-tiers | Several membership tiers | yt tw fb? x?
member-badges | Member loyalty badges in chat | yt tw ki?
member-emoji | Member-only emoji | yt tw ki?
brand-deals | Brand deal marketplace | yt tt ig fb
paid-partnership | Paid partnership labels | yt x fb ig tt
product-affiliate | Earn commission by tagging products | yt tt ig?
paid-courses | Paid courses | yt
fundraisers | Fundraisers and donate buttons | yt fb ig tt tw
ticket-sales | Event ticket sales | yt? fb dh
creator-bonuses | Platform bonus programs | fb ig? tt?
shorts-revenue | Ad revenue share on short videos | yt fb tt?
premium-revenue | Revenue share from premium subscribers | yt x

# Premium plans
premium-plan | Premium membership plan | yt x tw ru fb ig fc dh
ad-free | Ad-free viewing tier | yt x? tw ru fb? ig? dh?
family-plan | Family plans | yt dh
student-plan | Student discounts | yt
undo-post | Undo a post before it sends | x
reader-mode | Reader mode for long threads | x
longer-videos-premium | Longer uploads for subscribers | x
prime-sub | Free monthly channel subscription with another membership | tw
premium-badge | Premium badge on profiles | x fb ig fc dh?

# Communities and messages
message-requests | Message requests inbox | x fb ig tt ma? bs? dh
read-receipts | Read receipts with an off switch | x fb ig tt? dh
typing-indicator | Typing indicators | x fb ig tt bs? dh?
unsend | Unsend a message for everyone | x fb ig tt
pin-chats | Pin conversations | fb ig tt x?
archive-chats | Archive conversations | fb ig x? dh
mute-chats | Mute conversations | x fb ig tt bs
chat-themes | Chat themes and nicknames | fb ig
gif-messages | GIFs and stickers in messages | x fb ig tt dh
scheduled-messages | Scheduled messages | fb ig
live-location | Share live location in chat | fb ig
screenshot-alerts | Screenshot alerts in disappearing chats | fb ig
group-roles | Group chat admins and invite links | fb ig x? tt? dh
broadcast-channels | One-to-many broadcast channels | fb ig yt?
group-guides | Courses and guides inside groups | fb
community-rules | Community rules and membership questions | fb x dh
anonymous-posting | Anonymous posting in groups | fb
admin-assist | Automatic group moderation rules | fb x?
community-insights | Community insights | fb
friend-requests | Two-way friend connections | fb
people-suggestions | People you may know | fb ig x tt yt? bs? dh
contact-sync | Find friends from your contacts | fb ig tt x
birthdays | Birthday reminders | fb
dating | Dating | fb
chat-payments | Send money in chat | fb? x? dh
message-translate | Translate messages | ig fb? x? dh
group-calls | Group video calls | fb ig
watch-together | Watch together on a call | fb ig
call-screen-share | Screen sharing in calls | fb ig?
chat-folders | Chat folders and filters | fb? ig x? dh?
starred-messages | Save messages | fb? ig? x?

# Studio and creation
camera-filters | Camera colour filters | fb ig tt yt dh?
beauty-retouch | Beauty and retouch effects | tt ig yt?
record-timer | Hands-free recording timer | yt ig tt
record-speed | Record at different speeds | yt ig tt
voice-effects | Voice effects on videos | ig tt yt? dh?
voiceover | Record a voiceover | yt ig tt dh
sticker-maker | Turn photos into stickers | ig tt fb?
ar-effect-builder | Build your own AR effects | tt
ai-restyle | AI restyle of photos and videos | fb ig tt? yt? dh?
ai-avatar | AI avatar of yourself | fb ig tt? dh?
ai-labels | "Made with AI" labels | yt fb ig tt x? bs?
ai-summary | AI video summaries | yt fb? x? dh?
ai-search | AI answers in search | yt? x fb ig tt?
video-templates | Video templates with slots | ig tt yt? fb? dh
separate-editor-app | Separate video editing app | yt fb ig tt

# Safety and personalization
restrict | Quietly restrict an account | ig fb? tt?
comment-filters | Keyword comment filters for creators | yt fb ig tt tw? dh
hold-for-review | Hold comments for review | yt fb? ig? tt dh?
limit-interactions | Temporarily limit interactions | ig x tt?
private-account | Private or protected account | x fb ig tt ma dh
sensitive-content | Sensitive and adult content settings | yt? x ig tt bs ma tw dh
content-labels | Content classification labels | yt tw bs ma? x?
labelers | Subscribe to moderation labelers | bs
moderation-lists | Shared block and mute lists | bs ma?
screen-time | Screen-time reminders and limits | yt fb ig tt
family-pairing | Parent-linked teen accounts | yt fb ig tt tw?
teen-accounts | Teen accounts with built-in protections | yt fb ig tt
age-checks | Age verification | yt fb ig tt x? bs? tw?
two-factor | Two-step verification | yt x ki tw fb ig tt ru ma bs dh
security-keys | Hardware security keys | yt x fb ig?
login-alerts | New login alerts | yt x fb ig tt tw?
security-checkup | Security checkup | yt fb ig? tt
account-status | Account status and strikes page | yt fb ig tt tw?
appeals | Appeal moderation decisions | yt x ki tw fb ig tt bs ma? dh
transparency-reports | Transparency reports | yt x tw fb ig tt bs
oversight-board | Independent oversight board | fb ig
tag-controls | Control who can tag or mention you | fb ig x tt
search-history | Clear search and watch history | yt x fb ig tt dh
ad-preferences | Ad preferences and topics | yt x fb ig tt dh?
incognito | Incognito mode | yt
off-platform | Off-platform activity controls | fb ig
nudity-filter | Nudity protection in messages | ig
safety-check | Safety Check during crises | fb
sensitive-blur | Blur sensitive media until tapped | x bs ma ig?

# Accessibility
caption-styles | Caption size and style settings | yt tw? fb?
audio-description | Audio description tracks | yt?
reduce-motion | Reduce motion setting | x bs ma? dh
text-size | Text size setting | x bs fb?
high-contrast | High-contrast mode | x ma?
keyboard-shortcuts | Keyboard shortcuts | yt x fb ma bs? dh
alt-text-reminders | Alt text reminders | bs? ma? x?
screen-reader-docs | Published screen reader guides | yt fb tw x?

# Developers and API
public-api | Public developer API | yt x ki tw fb ig tt ru? ma bs fc dh
posting-api | Content posting API | yt x fb ig tt ma bs fc dh
analytics-api | Analytics API | yt fb ig tt x?
live-api | Live streaming and chat API | yt tw ki ru x?
login-with | "Sign in with" for other sites | x tw fb tt yt? ma bs fc
embed-player-api | Embeddable player API | yt tw ki? fb
ads-api | Advertising API | yt x fb tt
open-source | Open-source code | ma bs fc x? dh
self-hosting | Run your own server | ma bs fc
firehose | Full public data firehose | bs fc ma? x?
custom-feed-builder | Build and publish custom feeds | bs fc?
developer-portal | Developer portal and docs | yt x ki tw fb tt ma bs fc
chat-bots | Chat bot accounts | tw yt? ki x? ma bs? dh?
bot-labels | Automated account labels | x ma bs?

# Business and advertising
business-pages | Business pages and profiles | yt x fb ig tt
conversion-pixel | Conversion tracking pixel | yt x fb tt
custom-audiences | Custom and lookalike audiences | yt x fb tt
ad-ab-tests | Ad A/B testing | yt x fb tt
lead-forms | Lead generation forms | yt x fb ig tt
creator-ads | Boost a creator's post as an ad | fb ig tt x? dh?
promote-button | One-tap promote from a post | yt x fb ig tt ru dh
ad-library | Public ad library | yt fb ig tt x?
brand-safety | Brand safety controls for advertisers | yt x fb tt
business-inbox | Business inbox for messages | fb ig tt?
auto-replies | Automatic replies and FAQs | fb ig tt?
saved-replies | Saved replies | fb ig
appointments | Appointment booking | fb ig?
business-verification | Business verification | x fb tt?
ai-ad-creative | AI ad creative generation | yt fb tt
promoted-trends | Promoted trends and takeovers | x tt dh?
skippable-ads | Skippable in-stream video ads | yt fb? tw ki?

# Ownership and commerce
marketplace | Local buy and sell marketplace | fb
in-app-checkout | In-app checkout | tt fb? ig? dh
buyer-protection | Purchase protection | fb tt dh?
order-tracking | Order tracking | tt fb? dh
discount-codes | Discount codes | tt yt?
shopping-tab | Shopping tab | tt yt? fb ig? dh
job-listings | Job listings | fb x dh
product-catalog | Product catalogues | yt fb ig tt dh

# Notifications
per-creator-alerts | All, some or no alerts per creator | yt tw x tt?
live-alerts | Go-live alerts to followers | yt x ki tw fb ig tt ru dh

# Apps and devices
ios-app | iOS app | yt x ki tw fb ig tt ru ma bs fc dh
android-app | Android app | yt x ki tw fb ig tt ru ma? bs fc dh
web-app | Full web app | yt x ki tw fb ig tt ru ma bs fc dh
tablet-layout | Tablet layout | yt x tw fb ig tt bs? dh?
desktop-app | Installable desktop app | yt? x? tw? fb? ma?
lite-app | Lite app for slow phones | fb tt yt?
kids-app | Separate kids app | yt tt?
music-app | Separate music app | yt
tv-remote | Phone as a TV remote | yt
watch-app | Smartwatch app | yt? fb?
third-party-apps | Many independent third-party apps | ma bs fc x?
power-user-dashboard | Multi-column power-user dashboard | x ma? bs?
`;

const CODES: Record<string, PlatformId | 'dehub'> = {
  yt: 'youtube', x: 'x', ki: 'kick', tw: 'twitch', fb: 'facebook', ig: 'instagram',
  tt: 'tiktok', ru: 'rumble', ma: 'mastodon', bs: 'bluesky', fc: 'farcaster', dh: 'dehub',
};

export type InventoryMark = 'yes' | 'partial';
export interface InventoryRow { id: string; category: string; name: string; marks: Partial<Record<PlatformId | 'dehub', InventoryMark>> }

export const RIVAL_ROWS: InventoryRow[] = (() => {
  const rows: InventoryRow[] = [];
  let category = '';
  for (const raw of RIVAL_INVENTORY.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) { category = line.slice(2); continue; }
    const [id, name, list = ''] = line.split('|').map(part => part.trim());
    const marks: InventoryRow['marks'] = {};
    for (const token of list.split(/\s+/).filter(Boolean)) {
      const partial = token.endsWith('?');
      const platform = CODES[partial ? token.slice(0, -1) : token];
      if (!platform) throw new Error(`Unknown brand code "${token}" on ${id}`);
      marks[platform] = partial ? 'partial' : 'yes';
    }
    rows.push({ id, category, name, marks });
  }
  return rows;
})();

type Source = { title: string; url: string };
const s = (title: string, url: string): Source => ({ title, url });
/** Where each brand's ticks come from: its official help hub for that area, or its general help centre. */
const HUBS: Record<PlatformId, { default: Source } & Partial<Record<string, Source>>> = {
  youtube: {
    default: s('YouTube Help', 'https://support.google.com/youtube'),
    'Posts and discovery': s('YouTube posts', 'https://support.google.com/youtube/answer/7124474'),
    'Profiles and identity': s('YouTube channel profile', 'https://support.google.com/youtube/answer/2657964'),
    'Live video and audio': s('YouTube live streaming', 'https://support.google.com/youtube/answer/2474026'),
    'Creator analytics': s('YouTube Analytics', 'https://support.google.com/youtube/answer/9002587'),
    'Creator income': s('How to earn money on YouTube', 'https://support.google.com/youtube/answer/72857'),
    'Premium plans': s('YouTube Premium benefits', 'https://support.google.com/youtube/answer/6308116'),
    'Communities and messages': s('YouTube comment settings', 'https://support.google.com/youtube/answer/9483359'),
    'Studio and creation': s('YouTube Shorts creation tools', 'https://blog.youtube/news-and-events/new-shorts-creation-tools-2025/'),
    Accessibility: s('YouTube with a screen reader', 'https://support.google.com/youtube/answer/189278'),
    'Developers and API': s('YouTube for Developers', 'https://developers.google.com/youtube'),
    'Business and advertising': s('YouTube Ads', 'https://www.youtube.com/ads/'),
    'Ownership and commerce': s('Shopping on YouTube', 'https://support.google.com/youtube/answer/12257682'),
    Notifications: s('Manage YouTube notifications', 'https://support.google.com/youtube/answer/3382248'),
  },
  x: {
    default: s('X Help Center', 'https://help.x.com/en/using-x'),
    'Live video and audio': s('X Live Studio', 'https://help.x.com/en/using-x/live-studio'),
    'Premium plans': s('X Premium', 'https://help.x.com/en/using-x/x-premium'),
    'Communities and messages': s('X direct messages', 'https://help.x.com/en/using-x/direct-messages'),
    'Safety and personalization': s('X safety and security', 'https://help.x.com/en/safety-and-security'),
    'Developers and API': s('X Developer Platform', 'https://developer.x.com/en/docs'),
    'Business and advertising': s('X Business help', 'https://business.x.com/en/help'),
  },
  kick: {
    default: s('KICK Help Center', 'https://help.kick.com/en/'),
    'Live video and audio': s('KICK streaming guides', 'https://help.kick.com/en/collections/3734631-streaming'),
    'Developers and API': s('KICK developer docs', 'https://docs.kick.com/'),
  },
  twitch: {
    default: s('Twitch Help', 'https://help.twitch.tv/s/'),
    'Live video and audio': s('Twitch Creator Dashboard', 'https://help.twitch.tv/s/article/creator-dashboard'),
    'Creator analytics': s('Twitch channel analytics', 'https://help.twitch.tv/s/article/channel-analytics'),
    'Premium plans': s('Twitch Turbo', 'https://help.twitch.tv/s/article/twitch-turbo'),
    'Safety and personalization': s('Twitch Safety Center', 'https://safety.twitch.tv/'),
    Accessibility: s('Accessibility on Twitch', 'https://help.twitch.tv/s/article/accessibility-on-twitch'),
    'Developers and API': s('Twitch developer docs', 'https://dev.twitch.tv/docs/'),
  },
  facebook: {
    default: s('Facebook Help Center', 'https://www.facebook.com/help'),
    'Posts and discovery': s('Share and manage posts on Facebook', 'https://www.facebook.com/help/1640261589632787'),
    'Live video and audio': s('Go live on Facebook', 'https://www.facebook.com/help/1636872026560015'),
    'Communities and messages': s('Facebook Groups', 'https://www.facebook.com/help/1629740080681586'),
    'Premium plans': s('Meta Verified', 'https://www.meta.com/meta-verified/'),
    'Safety and personalization': s('Meta Safety Center', 'https://www.facebook.com/safety'),
    Accessibility: s('Facebook accessibility', 'https://www.facebook.com/help/273947702950567'),
    'Developers and API': s('Meta for Developers', 'https://developers.facebook.com/docs/'),
    'Business and advertising': s('Meta Business Help Center', 'https://www.facebook.com/business/help'),
  },
  instagram: {
    default: s('Instagram Help Center', 'https://help.instagram.com'),
    'Premium plans': s('Meta Verified', 'https://www.meta.com/meta-verified/'),
    'Safety and personalization': s('Instagram safety', 'https://about.instagram.com/safety'),
    'Developers and API': s('Instagram Platform', 'https://developers.facebook.com/docs/instagram-platform'),
    'Business and advertising': s('Meta Business Help Center', 'https://www.facebook.com/business/help'),
  },
  tiktok: {
    default: s('TikTok Help Center', 'https://support.tiktok.com/en/using-tiktok'),
    'Live video and audio': s('TikTok LIVE, gifts and wallet', 'https://support.tiktok.com/en/live-gifts-wallet'),
    'Communities and messages': s('TikTok messaging and notifications', 'https://support.tiktok.com/en/using-tiktok/messaging-and-notifications'),
    'Studio and creation': s('Creating TikTok videos', 'https://support.tiktok.com/en/using-tiktok/creating-videos'),
    'Creator analytics': s('TikTok Creator Academy', 'https://www.tiktok.com/creator-academy/'),
    'Creator income': s('TikTok Creator Academy', 'https://www.tiktok.com/creator-academy/'),
    'Safety and personalization': s('TikTok safety', 'https://support.tiktok.com/en/safety-hc'),
    'Developers and API': s('TikTok for Developers', 'https://developers.tiktok.com/'),
    'Business and advertising': s('TikTok Business Help', 'https://ads.tiktok.com/help/'),
    'Ownership and commerce': s('TikTok Shop Academy', 'https://seller-us.tiktok.com/university/home'),
  },
  rumble: {
    default: s('Rumble help', 'https://rumble.support/en/help'),
    'Live video and audio': s('Rumble Studio', 'https://studio.rumble.com/'),
    'Premium plans': s('Rumble Premium', 'https://rumble.com/premium'),
  },
  mastodon: {
    default: s('Mastodon user guide', 'https://docs.joinmastodon.org/user/'),
    'Profiles and identity': s('Mastodon moving accounts', 'https://docs.joinmastodon.org/user/moving/'),
    'Safety and personalization': s('Mastodon unwanted content tools', 'https://docs.joinmastodon.org/user/moderating/'),
    'Developers and API': s('Mastodon API', 'https://docs.joinmastodon.org/client/intro/'),
  },
  bluesky: {
    default: s('Bluesky product updates', 'https://bsky.social/about/blog'),
    'Profiles and identity': s('Bluesky verification', 'https://bsky.social/about/blog/04-21-2025-verification'),
    'Safety and personalization': s('Bluesky stackable moderation', 'https://bsky.social/about/blog/03-12-2024-stackable-moderation'),
    'Developers and API': s('Bluesky developer docs', 'https://docs.bsky.app/'),
  },
  farcaster: {
    default: s('Farcaster docs', 'https://docs.farcaster.xyz/learn'),
    'Developers and API': s('Farcaster developer docs', 'https://docs.farcaster.xyz/developers/'),
  },
};

/** Source key for a brand's tick on an inventory row; registers the source the first time. */
export function rivalSource(platform: PlatformId, category: string, sources: Record<string, Source>): string {
  const hub = HUBS[platform][category] ? category : 'default';
  const key = `rival:${platform}:${hub}`;
  sources[key] ??= HUBS[platform][hub]!;
  return key;
}
