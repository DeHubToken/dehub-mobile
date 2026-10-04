# Staking opening balance repair, 4 October 2026

The shared staking ledger could copy deposits already recorded as individual
transfers into a synthetic opening balance after a server restart. The next
deposit then recomputed the position using both representations. The correction
is in DeHubToken/dehub-stream-backend#498.

For the reported account, three Base receipts prove deposits of 1,000,000,
5,933,266.051118805, and 200,000 DHB. The correct stake is 7,133,266.051118805 DHB.
The erroneous opening duplicated the first two deposits, producing
14,066,532.10223761 DHB. This is not corrected by halving all staking balances.

The original production rows were backed up before the overlapping opening was
set to zero. The two genuine legacy openings were preserved. The shared API
reports 7,175,612.067977621 DHB including 42,346.016858816605 liquid DHB.

Both apps read the corrected `balanceData.staked` figure. Do not add the
Supabase `staking_records` deposits on top of it: that table is incomplete and
does not include the third deposit. A client cannot compensate for an incorrect
server ledger by guessing a multiplier. The regression fixture verifies that a
fresh, lower amount replaces the earlier inflated total.
