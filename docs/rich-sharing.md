# Public rich sharing

Pasting a supported link produces a source-attributed card in the composer, feed, comments and chat on web and mobile. Existing Polymarket and Manifold previews continue through the same pipeline.

| Provider | Supported links | Card |
| --- | --- | --- |
| Snapshot | Off-chain proposal links on snapshot.org and snapshot.box | Space, choices, weighted scores, status and closing time |
| Audius | Tracks, albums and playlists on audius.co | Artwork, artist, duration or track count; tap-to-play for public, ungated tracks |
| DefiLlama | /protocol/slug | Current total value locked in USD |
| GitHub | Public repositories, issues, PRs and releases | Title, description, stars/forks or issue state and release tag |
| ENS | Bare ASCII second-level .eth names and app.ens.domains profile links | Resolved Ethereum address, description and HTTPS avatar |
| IPFS | ipfs:// links and recognized gateway links | CID, filename and content type; bounded raster images and tap-to-play audio |

## Sources and limits

- [Snapshot Hub](https://docs.snapshot.box/tools/api): public GraphQL, 100 requests/minute. Displayed scores are voting power, not prediction probabilities. Voting remains on Snapshot.
- [Audius](https://docs.audius.co/sdk/resolve): public resolve/stream requests use app_name=DeHub with no account secret. Tested unauthenticated on 2026-10-08. Do not create a stream for restricted, unlisted or deleted tracks. Playlists open on Audius; this does not download or republish music.
- [DefiLlama](https://api-docs.defillama.com/): use the small public /tvl/{protocol} endpoint, avoiding full protocol history per card.
- [GitHub](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): public unauthenticated REST; the limit is 60 requests/hour per originating IP. Shared-IP users can hit this limit. Private repository access is not requested.
- [ENS](https://docs.ens.domains/web/resolution/): read the mainnet registry and standard resolver through the public Ethereum RPC. Wildcard/CCIP resolvers, Unicode names and NFT avatar resolution are not included. A failed resolution never displays a fabricated address.
- [Filebase public IPFS gateway](https://filebase.com/docs/ipfs/concepts/what-is-an-ipfs-gateway): best-effort public retrieval, limited to 200 requests/minute and intended for light usage. Legacy gateway links resolve through Filebase because [ipfs.io and dweb.link retired](https://gatewaychanges.ipfs.io/). HEAD retrieves type and size. Only raster images up to 10 MB auto-render; HTML/SVG remain links. Retrieval does not pin content or independently verify its hash. Sustained traffic needs a separately provisioned gateway; no paid gateway is enabled here.

Successful previews cache for five minutes, failures for one minute, with 100 entries and concurrent request deduplication per client. Requests abort after eight seconds and never retry in a loop. Every card retains its original provider link and shows when its data was fetched, or a failed-to-load state. No trading, wallet signatures, transactions, paid services, new database tables or Edge Function deployment are required.

Both clients use the same parser and normalizer. Keep rich-links.ts and rich-link-data.ts in web src/lib and mobile libs identical; only ens-hash.ts differs between existing ethers versions. UI labels reuse translated strings.

## Production verification

Use https://dehub.io/app and the production mobile channel. Staging is retired. Preserve any existing composer draft, paste examples temporarily, inspect the resulting cards, then restore the draft without publishing a test post.

- https://snapshot.org/#/yam.eth/proposal/0xaee9727ec0319e77da7ac49d5e4db631a75fb034aa27748e688c4bfb8458c349
- https://audius.co/camouflybeats/hypermantra-86216
- https://defillama.com/protocol/aave
- https://github.com/ipfs/kubo
- vitalik.eth
- A known available ipfs:// CID, including an image and an HTML document.

Check narrow layouts, provider failures, open-source links, source navigation, audio play/pause and pause-on-navigation/background behavior. Playback is user-initiated and media is not preloaded. Cloud CI covers parsing, spoofed hosts, malformed data, gated music, media restrictions, failure caching and request deduplication.

