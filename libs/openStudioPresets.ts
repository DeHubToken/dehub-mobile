import type { CreatorTemplate } from './creatorTemplates';

export const OPEN_STUDIO_PRESETS: CreatorTemplate[] = [
    {
        "id":  "open-orchard-portrait",
        "nameKey":  "creator.presetOpenOrchardPortraitName",
        "hintKey":  "creator.presetOpenOrchardPortraitHint",
        "kind":  "image",
        "group":  "Portrait",
        "template":  "Portrait of {subject}, medium format film, shallow depth of field",
        "sample":  "a beekeeper in a sunlit orchard",
        "model":  "gemini-3-pro-image",
        "aspect":  "4:5"
    },
    {
        "id":  "open-recording-studio",
        "nameKey":  "creator.presetOpenRecordingStudioName",
        "hintKey":  "creator.presetOpenRecordingStudioHint",
        "kind":  "image",
        "group":  "Design",
        "template":  "Isometric cutaway of {subject}, warm tungsten light, matte clay render",
        "sample":  "a tiny recording studio",
        "model":  "gemini-3.1-flash-image",
        "aspect":  "1:1"
    },
    {
        "id":  "open-poppy-still-life",
        "nameKey":  "creator.presetOpenPoppyStillLifeName",
        "hintKey":  "creator.presetOpenPoppyStillLifeHint",
        "kind":  "image",
        "group":  "Commercial",
        "template":  "Editorial still life: {subject}, hard noon shadows",
        "sample":  "brutalist concrete vases with wild poppies",
        "model":  "gemini-3-pro-image",
        "aspect":  "4:5"
    },
    {
        "id":  "open-midnight-alley",
        "nameKey":  "creator.presetOpenMidnightAlleyName",
        "hintKey":  "creator.presetOpenMidnightAlleyHint",
        "kind":  "image",
        "group":  "Film",
        "template":  "{subject}, sodium lamps, reflections in every puddle, 35mm",
        "sample":  "Rain-slick alley at midnight",
        "model":  "gemini-3-pro-image",
        "aspect":  "16:9"
    },
    {
        "id":  "open-craftsman-portrait",
        "nameKey":  "creator.presetOpenCraftsmanPortraitName",
        "hintKey":  "creator.presetOpenCraftsmanPortraitHint",
        "kind":  "image",
        "group":  "Portrait",
        "template":  "Studio portrait of {subject}, single softbox, black backdrop",
        "sample":  "an elderly luthier holding a half-built violin",
        "model":  "gemini-3-pro-image",
        "aspect":  "4:5"
    },
    {
        "id":  "open-salt-ponds",
        "nameKey":  "creator.presetOpenSaltPondsName",
        "hintKey":  "creator.presetOpenSaltPondsHint",
        "kind":  "image",
        "group":  "Abstract",
        "template":  "Aerial top-down of {subject}, pink and ochre geometry, midday clarity",
        "sample":  "salt evaporation ponds",
        "model":  "gemini-3.1-flash-image",
        "aspect":  "16:9"
    },
    {
        "id":  "open-watch-blueprint",
        "nameKey":  "creator.presetOpenWatchBlueprintName",
        "hintKey":  "creator.presetOpenWatchBlueprintHint",
        "kind":  "image",
        "group":  "Design",
        "template":  "Cutaway illustration of {subject}, blueprint lines on warm paper",
        "sample":  "a mechanical watch movement",
        "model":  "gemini-3.1-flash-image",
        "aspect":  "1:1"
    },
    {
        "id":  "open-overgrown-house",
        "nameKey":  "creator.presetOpenOvergrownHouseName",
        "hintKey":  "creator.presetOpenOvergrownHouseHint",
        "kind":  "image",
        "group":  "Film",
        "template":  "{subject}, overcast light, large format detail",
        "sample":  "Overgrown modernist house reclaimed by ferns",
        "model":  "gemini-3-pro-image",
        "aspect":  "16:9"
    },
    {
        "id":  "open-espresso-steam",
        "nameKey":  "creator.presetOpenEspressoSteamName",
        "hintKey":  "creator.presetOpenEspressoSteamHint",
        "kind":  "image",
        "group":  "Commercial",
        "template":  "{subject}, rim light, steam caught mid-curl",
        "sample":  "Matte ceramic espresso cup on wet slate",
        "model":  "gemini-3-pro-image",
        "aspect":  "1:1"
    },
    {
        "id":  "open-ski-lodge",
        "nameKey":  "creator.presetOpenSkiLodgeName",
        "hintKey":  "creator.presetOpenSkiLodgeHint",
        "kind":  "image",
        "group":  "Design",
        "template":  "{subject}, wood paneling and orange wool, low winter sun through glass",
        "sample":  "1970s ski lodge interior",
        "model":  "gemini-3-pro-image",
        "aspect":  "16:9"
    },
    {
        "id":  "open-dough-closeup",
        "nameKey":  "creator.presetOpenDoughCloseupName",
        "hintKey":  "creator.presetOpenDoughCloseupHint",
        "kind":  "image",
        "group":  "Commercial",
        "template":  "{subject}, window light, muted palette, close crop",
        "sample":  "Hands kneading dough on floured marble",
        "model":  "gemini-3-pro-image",
        "aspect":  "4:5"
    },
    {
        "id":  "open-desert-stars",
        "nameKey":  "creator.presetOpenDesertStarsName",
        "hintKey":  "creator.presetOpenDesertStarsHint",
        "kind":  "image",
        "group":  "Film",
        "template":  "{subject}, long exposure, star trails over a white dome",
        "sample":  "Desert observatory at blue hour",
        "model":  "gemini-3-pro-image",
        "aspect":  "16:9"
    },
    {
        "id":  "open-forest-aerial",
        "nameKey":  "creator.presetOpenForestAerialName",
        "hintKey":  "creator.presetOpenForestAerialHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Slow aerial dolly over {subject}, volumetric light through the canopy",
        "sample":  "fog-covered pine forest at dawn",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-ink-bloom",
        "nameKey":  "creator.presetOpenInkBloomName",
        "hintKey":  "creator.presetOpenInkBloomHint",
        "kind":  "video",
        "group":  "Effects",
        "template":  "Macro shot of {subject}, backlit, ultra slow motion, black backdrop",
        "sample":  "ink blooming in water",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-market-tracking",
        "nameKey":  "creator.presetOpenMarketTrackingName",
        "hintKey":  "creator.presetOpenMarketTrackingHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Handheld tracking shot through {subject}, rain on lenses, shallow focus",
        "sample":  "a neon market at night",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-late-night-diner",
        "nameKey":  "creator.presetOpenLateNightDinerName",
        "hintKey":  "creator.presetOpenLateNightDinerHint",
        "kind":  "video",
        "group":  "Film",
        "template":  "Locked-off shot of {subject}, one customer, rain outside, sign flickering",
        "sample":  "a diner at 3am",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-sculptor-push",
        "nameKey":  "creator.presetOpenSculptorPushName",
        "hintKey":  "creator.presetOpenSculptorPushHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Slow push-in on {subject}, north-facing window light",
        "sample":  "a sculptor\u0027s hands shaping wet clay",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-lighthouse-orbit",
        "nameKey":  "creator.presetOpenLighthouseOrbitName",
        "hintKey":  "creator.presetOpenLighthouseOrbitHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Drone orbit around {subject}, grey sea, spray hitting the lens",
        "sample":  "a lighthouse in heavy swell",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-canyon-timelapse",
        "nameKey":  "creator.presetOpenCanyonTimelapseName",
        "hintKey":  "creator.presetOpenCanyonTimelapseHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Timelapse of cloud shadows sweeping {subject}, golden hour into dusk",
        "sample":  "a canyon rim",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-greenhouse-walk",
        "nameKey":  "creator.presetOpenGreenhouseWalkName",
        "hintKey":  "creator.presetOpenGreenhouseWalkHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Steadicam walk through {subject}, dust in shafts of light, slow reveal",
        "sample":  "an empty greenhouse",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-record-whip-pan",
        "nameKey":  "creator.presetOpenRecordWhipPanName",
        "hintKey":  "creator.presetOpenRecordWhipPanHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Whip pan from {subject}, tungsten glow, heavy motion blur",
        "sample":  "a spinning record to a dancer mid-turn",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-underwater-surface",
        "nameKey":  "creator.presetOpenUnderwaterSurfaceName",
        "hintKey":  "creator.presetOpenUnderwaterSurfaceHint",
        "kind":  "video",
        "group":  "Film",
        "template":  "Underwater shot of {subject}, bubbles, sunlight refracting",
        "sample":  "a swimmer breaking the surface",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-viaduct-train",
        "nameKey":  "creator.presetOpenViaductTrainName",
        "hintKey":  "creator.presetOpenViaductTrainHint",
        "kind":  "video",
        "group":  "Film",
        "template":  "Static wide of {subject}, lit windows, long lens compression",
        "sample":  "a train crossing a viaduct at dusk",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    },
    {
        "id":  "open-tower-tilt",
        "nameKey":  "creator.presetOpenTowerTiltName",
        "hintKey":  "creator.presetOpenTowerTiltHint",
        "kind":  "video",
        "group":  "Camera",
        "template":  "Slow tilt down {subject}, overcast city light",
        "sample":  "a glass tower facade to a busy crosswalk",
        "model":  "kling-2.5-turbo",
        "aspect":  "16:9"
    }
];
