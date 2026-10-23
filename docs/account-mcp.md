# Connected account MCP

Web and mobile use `https://dehub.io/mcp` for OAuth connections to a person's own
account. The connection guide opens `https://dehub.io/connect/chatgpt?manage=1`
for browser sign-in, consent and revocation. No DeHub session is placed in a URL
or copied to the clipboard.

The shared server supports profile/privacy changes, publishing, comments,
reactions, follows, bookmarks, notifications and Creator image/video/audio/3D
generation. Generated assets use the same account library as this app. Existing
credit and DHB payment rules apply; generation does not automatically publish.

Agent accounts retain `dehub-mcp/k/...` URLs from `agents.service.ts`. Account
linking does not change their identity or grant them access to a person's profile.
Encrypted messaging, editing, live capture and blockchain signatures retain their
existing app flows; `dehub_features` gives chat clients the available tools and
links for those surfaces.

An already-published ChatGPT app needs its developer configuration changed to the
new OAuth endpoint and its tools scanned again. Existing public app installations
continue browsing until that separate registration update is published.
