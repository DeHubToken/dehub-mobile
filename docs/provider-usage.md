# Provider routing and accounting

The shared chat router serves both web and mobile. Pro requests try the exact
requested Google model and keep that model on gateway fallback; they never step
down to a Lite model. The existing eligible cheap-model ladder, quota backoff,
private-content constraints and caller cancellation remain in place. Assistant
rounds now use the same router, including models that still require the gateway.
The existing default-assistant training-tier policy is unchanged.

`ai_provider_usage_daily` aggregates provider attempts by UTC day, feature,
provider, route, requested/served model, outcome, fallback reason and HTTP status.
It stores reported input/output, cached and reasoning token counters, elapsed
time, and reported-versus-missing coverage. It stores no prompts, responses,
wallets, credentials or per-user identifiers. Only the service role can read or
write it. Shared chat attempts include rejected output that could still have
been billed. Existing xAI, Venice and assistant search requests are metered too.

Each shared completion batches its attempts into one bounded, asynchronous SQL
write. Streams preserve their bytes and collect final usage when it is supplied;
cancellation or absent usage remains explicit. Google streaming requests ask for
usage using its documented compatible parameter. Accounting failures log a
status and do not retry, reroute or delay a user's answer.

Missing usage is unknown spend. A route named `free` does not prove a zero bill.
Cached and reasoning counters are subsets of the reported input/output totals,
so do not add them again. These counters are not a provider invoice and exclude
search request surcharges and generation routes that do not use these helpers.
No gateway markup is assumed, and no paid generation is needed to audit this.

Apply the versioned migration only after its PR and hosted SQL test pass. Keep
the migration ledger consistent. Deploy every Edge Function importing the shared
router or assistant helpers from the exact merged revision; a frontend deploy
does not update those bundles. Verify privilege restrictions and counter
aggregation with disposable transaction fixtures before examining real traffic.

The same backend route serves installed mobile clients without changing their
response contract. Client-side token limits and wallet quotes are not actual
provider usage. Keep existing caches, payments and model capability requirements.

Reference: [Google compatible streaming usage](https://ai.google.dev/gemini-api/docs/openai).

Text translation also shares the daily aggregates. Only requests reaching model
tiers create a meter: L1/L2 cache hits, same-language responses and MyMemory
responses add no provider-accounting write. Free-model, direct Google, fal and
gateway attempts flush together once per translation, including rejected paid
output. The provider order, daily cap and public/private routing stay unchanged.
Fallback reasons belong to the current request, including unset keys, parked
accounts and HTTP failures; no shared last-failure variable supplies them.

Native Google `usageMetadata` reports candidate output and thoughts separately.
The output total includes both and the reasoning counter is its thoughts subset;
cached input is already inside prompt input. Missing fal token reports remain
unknown. A free-model response rejected by translation validation is still counted
as a completed free-provider attempt. The counters do not infer a token bill
from character length or deduct cached input twice.

Reference: [Google native usage metadata](https://ai.google.dev/api/generate-content#UsageMetadata).
