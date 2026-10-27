# Comparison source audit — 27 October 2026

## Scope and result

The original 151-row catalogue was an initial product-guide summary. It was not a complete feature inventory. The expanded catalogue contains 524 capability rows across 16 categories. Counts include separately usable tools within a feature family; they are not a claim of 524 unique competitive advantages.

Source snapshots:

- Web: `c344c15adc3f435df8123f1a190dbbf6540cfe44`
- Native: `a04284b476c97dfd574cc6bab421e1f92ac2d7f9`

The 373 added rows identify a source owner in both repositories. Links pin those revisions so concurrent main changes do not silently change the cited evidence. Source ownership and implemented functions establish research evidence, not proof that every operation is currently available to every account or device. Public labels distinguish documentation, reviewed source, conditions, related products and unresolved equivalents.

## Inventory examined

| Surface family | Evidence inspected | Catalogue coverage |
| --- | --- | --- |
| Navigation and entry points | Web `src/App.tsx`, app pages and navigation constants; native `navigation/ScreenNames.ts`, `AppNavigator.tsx`, linking configuration and screen inventory | Public entry points, app links, directories and product families |
| Product guide | Web `public/docs-content/dapps.json`; guide, glossary and feature-board notes | Original catalogue plus account, publishing, playback, notification and live-production details |
| Publishing and profiles | Upload, profile, comments, Shorts, video, audio and scheduling surfaces in both clients | Formats, audiences, galleries, markup, covers, threads, Common Ground, writing assistance, playback and queue controls |
| Live production and Stages | Live Studio, overlays, rules, widgets, polls, recap, room controls and recordings | Production widgets and actions, guest broadcasting, room participation, transcripts, soundboard, translation and playback |
| Conversations and communities | Web messages, DirectMessageChat, DM crypto/media send paths and community pages; native ChatScreen, services/dm, crypto and community screens | Text/media messaging, encryption conditions, search, sharing, membership, invitations and moderation |
| Creator tools | Creator pages/screens, studio, Flow, campaign and reference planning, library and model controls | Generation formats, references, extension, Remake, voices, queue, plans, quotes, library and planning |
| Editor | Both editor libraries, video coverage notes, design command registry, editor guide, design panels and native editor screen | Timeline, speech/audio tools, masks, motion, stock assets, collaboration, design, charts, tables, bulk pages, presentations and exports |
| Account and preferences | Web settings and its owned controls; native account/privacy/notification settings and panels | Export, sessions, app connections, privacy, language, appearance, playback preferences, notification channels and wallet backup |
| Payments and ownership | Wallet, Dpay, exchange, launchpad, staking, badge, SuperPowers, marketplace, store, work and governance surfaces | Payment families and limits, delegation, reach tools, stores, bounties and proposals |
| Open web and automation | Federation documentation, mini app tools, assistant/agent panels and MCP surfaces | Open protocols, imports, cross-posting, application tools and configurable automation |
| Entertainment and reporting | Cinema, TV, music, arcade, stats, events, careers and raffle pages/screens | Discovery, viewing options, channel filters, chat, published figures, events and directories |

Aliases, redirects, loading/error screens, auth confirmation callbacks, administrative diagnostics and implementation helpers are not counted as independent public features. Marketing descriptions of prospective moderation-mining or guaranteed revenue do not establish a shipped capability and are not promoted into supported feature claims.

## Corrections from the deeper pass

- The first inventory compressed a large editor into a few rows. Design documents, charts, tables, QR payloads, bulk record production, presentations and numerous timeline controls were missing.
- The product guide says DM attachments are not encrypted. Both pinned clients contain attachment encryption and send/receive paths. The catalogue now distinguishes encrypted text and supported encrypted attachments, retaining the unencrypted fallback and visible conversation-metadata limitation. This is not an independent cryptographic audit.
- iOS disables crypto-backed purchases and reward actions through `config/storefront.ts`. Paid rows retain that restriction. Mature-content preferences are also excluded from iOS; no universal mature-content claim is made.
- Existing editor coverage notes contain historical gap labels subsequently addressed in source. The current source and editor guide were considered alongside those notes.
- Competitor evidence was broadened for messaging, moderation, polls, playback, export and preferences using primary help or product publications. Older announcements do not establish current numerical limits or pricing.

## Checks and limits

Catalogue tests check duplicate identifiers, requested platform coverage, resolvable source records, filters, unknown-state behavior, coverage denominators, referenced source ownership and sensitive capability limitations. Web and native use identical catalogue and detail modules. Cloud CI remains the authority for TypeScript and tests.

The comparison displays the count of competitor cells backed by sources. Missing cells remain **Not verified**, never an implied “No”. A checked source is not a completed end-to-end test. There is no claim that every feature of every competitor, every backend permission or every physical-device interaction has been fully checked.

Publication, production page interactions and native update delivery are tracked by the release PRs. Those checks verify the comparison surface; they do not certify all 524 underlying product actions.
