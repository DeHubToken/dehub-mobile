# Shared production delivery contract

The public website and native images/relays use dehub.io. Its A record must
resolve directly to the gateway in production-routing.json, with no competing
AAAA record until a verified IPv6 gateway exists. The application Worker lives
behind origin.dehub.io. API and Supabase retain their existing direct routes.

On 24 October 2026 the affected Samsung could connect to the API and Supabase,
but both 188.114.96.5 and 188.114.97.5 timed out on TCP/443. The existing apex
A record still pointed at the gateway but had been set to Proxied, undoing the
September recovery. Direct gateway HTTPS returned the current production
version over the phone's own Wi-Fi with certificate validation enabled.

Keep production-routing.json and production-routing.mjs in sync with dehubweb.
Both OTA paths now check public DNS through two resolvers and verify HTTPS/API
health before publication. The manual routing-contract workflow performs the
same verification without exporting or publishing a bundle. Regression tests
reject the observed anycast answers, mixed routes and unexpected IPv6. This
change needs no reinstall or OTA: existing binaries use the corrected DNS.

Do not work around a regressed route by changing the user's DNS, adding a VPN,
resetting sessions, or clearing application storage. After a routing change,
verify normal hostname resolution, TLS, the feed and media on the actual phone
without a tunnel or VPN. Release checks catch drift; they do not prevent a DNS
administrator from changing the record or guarantee against provider outages.
