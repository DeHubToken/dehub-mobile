# Mobile feature-board release check: 9 October 2026

The complete inventory and fix plan is maintained in [dehubweb](https://github.com/DeHubToken/dehubweb/blob/main/docs/feature-board-20261009.md). The production board has five Requests and two Shipping items.

- **Bridge:** preserve the API's grouped token amounts in the wallet history and public queue. `38,009` must not become zero. Match web formatting for valid amounts and use a dash for unavailable data. This display fix does not verify the outstanding destination payout or release the planned automated bridge.
- **Creator support:** PR 1567 implemented advertiser-funded video support. Confirm publication includes it and verify the native empty-inventory experience. Production has no eligible sponsor campaigns. USD revenue accrual is implemented; token settlement remains pending.
- **Bounties:** expiry already permits approved payments. Verify payment-preparation failures release unbroadcast reservations, and keep recovery of ambiguous signing attempts explicit. Never automatically resend a reserved payment.
- **Communities:** preserve original-post identity when sharing existing content; keep chat discoverable; fix the shared account-registration failure without weakening ownership verification.
- **Feedback:** reuse the existing form from navigation, converter completion and migration completion, preserving anonymity and consent.
- **Affiliate sub-referrals:** retain optional tracking through mobile deep links and signup, with dashboard parity and unchanged parent rewards.
- **Autonomous creator:** first resolve account registration, then define task permissions, funding limits, previews and revocation before funded execution.

Run checks on GitHub-hosted CI, merge through a PR, publish the exact merged revision through OTA, and distinguish publication from physical-device verification.
