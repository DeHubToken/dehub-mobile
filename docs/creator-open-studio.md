# Published studio presets

The template picker adds all 24 starter recipes from [the repository linked by Higgsfield’s team](https://github.com/wide-trace/open-higgsfield), pinned to commit `b16a0efe4d7e2707b56f8ccb02387fd2a9d2eddf`, `src/openhiggsfield/data.ts`. The release invitation is [the September 16 team post](https://x.com/gpumaxxer/status/2100307886408912985).

The catalog contains 12 image and 12 video recipes. Empty-subject output reproduces the published prompts verbatim. Subject replacement preserves the other shot instructions. `libs/openStudioPresets.ts` mirrors web’s `src/lib/creator/openStudioPresets.ts`. Both use the existing DeHub models and payment flow, with English and French labels and searchable names, hints, categories and prompt contents.

Mobile generation forwards the selected template’s image/video aspect ratio and video negative prompt, including paid and free image requests and retries. Requests without a template retain their existing defaults.

## Full live preset catalog

The [authenticated Marketing Studio catalog](https://open.higgsfield.ai/models/workflows/product-shots/api-reference) is separate from this release. It returns `total`, `cursor` and `items` from `GET https://api.higgsfield.ai/marketing-studio/image/presets?size=50`. All pages must be consumed with server-side API credentials. Enhanced generation uses the current preset ID and a product image; preset UUIDs must not be hardcoded.

Higgsfield account access, the full live catalog, and generation through Higgsfield remain unverified. The mobile application must receive this catalog through DeHub’s backend; provider credentials must stay on the server.
