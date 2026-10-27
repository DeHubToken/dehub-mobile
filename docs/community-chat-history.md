# Community chat history v1

Web and mobile consume the same read contract through `community_chat_page_v1`. The shared backend migration lives in dehubweb: `20261027183000_community_chat_history.sql`.

## Behavior

- Opens the newest 50 messages. Older pages use the full database timestamp and UUID as a compound cursor, without a 200-message history ceiling.
- Pages are newest first on the wire; clients deduplicate IDs and render chronological order. Microseconds are preserved.
- A deleted cursor row does not invalidate pagination.
- The latest pin and reply parents are fetched independently of the visible page, restricted to the same community.
- An anchor opens a window ending at a selected message. Jump to latest returns to the current conversation.
- Confirmed sends enter the sender's cache immediately, including private groups. Realtime echoes cannot duplicate that message.
- Query caches include community, wallet and anchor. Access-denied responses hide previously cached history and pins.
- Public groups retain the existing realtime subscription and reload on reconnect. Private groups retain the 15-second polling fallback. Loaded pages refresh sequentially to preserve cursor continuity; polling stops in the background, and mobile disables reads when its screen loses focus.
- Editing, reactions and deletion reconcile message rows, reply references and pins in every loaded page.

## API

Arguments: `_community_id`, optional `_before_at` plus `_before_id`, optional `_anchor_id`, and `_limit` (1–100, default 50). A cursor and anchor cannot be combined.

Response: `messages`, `references`, `pinned_message`, `next_cursor`. Null next_cursor means the end of history.

The function is SECURITY INVOKER. Existing row-level policies remain active. Private groups additionally require the verified wallet-session identity and active membership. A raw wallet-address header is insufficient.

## Delivery and validation

Deploy the versioned backend migration and record it in the migration ledger before publishing either client. This is additive: old clients continue using the existing table.

GitHub-hosted PostgreSQL tests cover long history, same-timestamp ties, cursor deletion, old pins/replies, reference and anchor isolation, invalid cursor inputs, unsigned/expired/nonmember sessions, and revoked membership. Both clients test cache reconciliation, account isolation, anchored navigation and access-denied refreshes. Typechecks and application tests run in cloud CI.

## Remaining foundations

This increment improves existing community groups. Multi-recipient direct messages, durable offline sending and idempotent retries, read receipts, authenticated private realtime, atomic reaction operations, full-history search, topics and Telegram-scale load certification remain separate work. Search still covers loaded messages. No Telegram transport or protocol compatibility is claimed.
