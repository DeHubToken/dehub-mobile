import { translateCopy as _translateCopy } from '../i18n/copy';
import { VIRAL_EFFECTS, type ViralEffect } from './viral-effects';
export interface ViralTemplate extends ViralEffect { motionSeconds?: number; sourceName?: string; sourceUrl?: string; }
/** Playable source clips, checked 2026-10-14. Motion control uses the selected
 * clip itself plus the creator's photo. These are not PixVerse effect IDs.
 * Jean Phil clips are sourced from the independent fan template catalog;
 * provider examples are credited individually. No view-count ranking claimed.
 */
export const VIRAL_MOTION_TEMPLATES: ViralTemplate[] = [
    {
        "id":  "jean-phil-night-selfie",
        "name":  "Jean Phil - Night selfie, pink suit",
        get displayName() { return _translateCopy("copy.c8f9731640ff", { defaultValue: "Jean Phil - Night selfie, pink suit" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/night-selfie.mp4?v=0e08ecdd",
        "poster":  "https://jeanphilai.com/media/tpl/night-selfie.webp?v=5a5fb932",
        "motionSeconds":  19.083333,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-the-steps",
        "name":  "Jean Phil - The steps",
        get displayName() { return _translateCopy("copy.c4103b25ad90", { defaultValue: "Jean Phil - The steps" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/the-steps.mp4?v=ae5a0fef",
        "poster":  "https://jeanphilai.com/media/tpl/the-steps.webp?v=5bdc3dbf",
        "motionSeconds":  21.083333,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-showroom",
        "name":  "Jean Phil - Fashion showroom",
        get displayName() { return _translateCopy("copy.323e9d1558a0", { defaultValue: "Jean Phil - Fashion showroom" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/showroom.mp4?v=bacdbf3e",
        "poster":  "https://jeanphilai.com/media/tpl/showroom.webp?v=14f69b3a",
        "motionSeconds":  17.75,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-bathtub",
        "name":  "Jean Phil - Bathtub",
        get displayName() { return _translateCopy("copy.445b36c07d1b", { defaultValue: "Jean Phil - Bathtub" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/bathtub.mp4?v=970b0024",
        "poster":  "https://jeanphilai.com/media/tpl/bathtub.webp?v=f31c27c1",
        "motionSeconds":  15.048382,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-flowers",
        "name":  "Jean Phil - Flowers in the park",
        get displayName() { return _translateCopy("copy.2b5447815db1", { defaultValue: "Jean Phil - Flowers in the park" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/flowers.mp4?v=819920ff",
        "poster":  "https://jeanphilai.com/media/tpl/flowers.webp?v=2cc46b25",
        "motionSeconds":  26.75,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-banquet",
        "name":  "Jean Phil - Banquet hall",
        get displayName() { return _translateCopy("copy.5208c2215a44", { defaultValue: "Jean Phil - Banquet hall" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/banquet.mp4?v=ddd18aea",
        "poster":  "https://jeanphilai.com/media/tpl/banquet.webp?v=e719c7f8",
        "motionSeconds":  23.383991,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-making-it-rain",
        "name":  "Jean Phil - Making it rain",
        get displayName() { return _translateCopy("copy.ab01be20149e", { defaultValue: "Jean Phil - Making it rain" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/making-it-rain.mp4?v=9302e0fd",
        "poster":  "https://jeanphilai.com/media/tpl/making-it-rain.webp?v=33c435aa",
        "motionSeconds":  8.058005,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-office-dance",
        "name":  "Jean Phil - Office lobby dance",
        get displayName() { return _translateCopy("copy.cd2eafa1a089", { defaultValue: "Jean Phil - Office lobby dance" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/office-dance.mp4?v=5343ac2b",
        "poster":  "https://jeanphilai.com/media/tpl/office-dance.webp?v=5c6bc626",
        "motionSeconds":  14.049002,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-ice-rink",
        "name":  "Jean Phil - Ice rink",
        get displayName() { return _translateCopy("copy.0999c16ef48c", { defaultValue: "Jean Phil - Ice rink" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/ice-rink.mp4?v=0cceb7e8",
        "poster":  "https://jeanphilai.com/media/tpl/ice-rink.webp?v=58ead186",
        "motionSeconds":  19.297007,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-cafe",
        "name":  "Jean Phil - Cafe terrace",
        get displayName() { return _translateCopy("copy.75e57e102fa2", { defaultValue: "Jean Phil - Cafe terrace" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/cafe.mp4?v=0d3913fd",
        "poster":  "https://jeanphilai.com/media/tpl/cafe.webp?v=d9b0a978",
        "motionSeconds":  28.585011,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-rooftop",
        "name":  "Jean Phil - Rooftop at sunset",
        get displayName() { return _translateCopy("copy.1b327464542a", { defaultValue: "Jean Phil - Rooftop at sunset" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/rooftop.mp4?v=39d2ffb3",
        "poster":  "https://jeanphilai.com/media/tpl/rooftop.webp?v=af71d59f",
        "motionSeconds":  19.708333,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-street-dance",
        "name":  "Jean Phil - Street dance",
        get displayName() { return _translateCopy("copy.40d586282f1b", { defaultValue: "Jean Phil - Street dance" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/street-dance.mp4?v=31c9f0fa",
        "poster":  "https://jeanphilai.com/media/tpl/street-dance.webp?v=395b4dc3",
        "motionSeconds":  24.75,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-the-wink",
        "name":  "Jean Phil - The wink",
        get displayName() { return _translateCopy("copy.1e8d604ce95a", { defaultValue: "Jean Phil - The wink" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/the-wink.mp4?v=80f8225f",
        "poster":  "https://jeanphilai.com/media/tpl/the-wink.webp?v=1d6669c1",
        "motionSeconds":  6.083333,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-oysters",
        "name":  "Jean Phil - Oyster bar",
        get displayName() { return _translateCopy("copy.173ab5a95e59", { defaultValue: "Jean Phil - Oyster bar" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/oysters.mp4?v=7c640b84",
        "poster":  "https://jeanphilai.com/media/tpl/oysters.webp?v=c85dd120",
        "motionSeconds":  26.077007,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-living-room",
        "name":  "Jean Phil - Living-room dance",
        get displayName() { return _translateCopy("copy.f628c6f22243", { defaultValue: "Jean Phil - Living-room dance" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/living-room.mp4?v=731f97db",
        "poster":  "https://jeanphilai.com/media/tpl/living-room.webp?v=b551a582",
        "motionSeconds":  10.041667,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-press",
        "name":  "Jean Phil - Press scrum",
        get displayName() { return _translateCopy("copy.38b68cf08de7", { defaultValue: "Jean Phil - Press scrum" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/press.mp4?v=1006ae51",
        "poster":  "https://jeanphilai.com/media/tpl/press.webp?v=0e835d27",
        "motionSeconds":  18.042993,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-woods",
        "name":  "Jean Phil - Ride through the woods",
        get displayName() { return _translateCopy("copy.87375affb69b", { defaultValue: "Jean Phil - Ride through the woods" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/woods.mp4?v=b7e62d5a",
        "poster":  "https://jeanphilai.com/media/tpl/woods.webp?v=e1fbbd81",
        "motionSeconds":  15.441995,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-church-night",
        "name":  "Jean Phil - Night walk by the church",
        get displayName() { return _translateCopy("copy.9b1cd87b69da", { defaultValue: "Jean Phil - Night walk by the church" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/church-night.mp4?v=1ede091f",
        "poster":  "https://jeanphilai.com/media/tpl/church-night.webp?v=43b9452d",
        "motionSeconds":  13.916667,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "jean-phil-golden-hour",
        "name":  "Jean Phil - Golden-hour selfie",
        get displayName() { return _translateCopy("copy.8ce760445729", { defaultValue: "Jean Phil - Golden-hour selfie" }); },
        "category":  "characters",
        "preview":  "https://jeanphilai.com/media/tpl/golden-hour.mp4?v=b66c1d66",
        "poster":  "https://jeanphilai.com/media/tpl/golden-hour.webp?v=97911587",
        "motionSeconds":  15.023991,
        "sourceName":  "Jean Phil AI",
        "sourceUrl":  "https://jeanphilai.com/"
    },
    {
        "id":  "motion-403739217192896",
        "name":  "Apex Dance",
        get displayName() { return _translateCopy("copy.21e63dc59fbc", { defaultValue: "Apex Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8820%E6%97%A5%281%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8820%E6%97%A5%281%29.jpg",
        "motionSeconds":  13.049615,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-391002072757312",
        "name":  "Cavalona Dance",
        get displayName() { return _translateCopy("copy.3228808fdbc5", { defaultValue: "Cavalona Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F4%E6%9C%889%E6%97%A5-%E5%89%AF%E6%9C%AC.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F4%E6%9C%889%E6%97%A5-%E5%89%AF%E6%9C%AC.jpg",
        "motionSeconds":  7.733333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-343058215445568",
        "name":  "Neymar DJ Dance",
        get displayName() { return _translateCopy("copy.0631408fc1cd", { defaultValue: "Neymar DJ Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fneymardjdance_260624.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fneymardjdance_260624.jpg",
        "motionSeconds":  13.266667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-343058274917440",
        "name":  "Gabu Dance",
        get displayName() { return _translateCopy("copy.d5516504f948", { defaultValue: "Gabu Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_gabudance_0624.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_gabudance_0624.png",
        "motionSeconds":  10.433333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-427124747250112",
        "name":  "Dingding Dangdang Dance",
        get displayName() { return _translateCopy("copy.3150f6d52609", { defaultValue: "Dingding Dangdang Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fautoteml_y2fc6x_jp_v2_2003.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fautoteml_y2fc6x_jp_v2_2003.jpg",
        "motionSeconds":  14.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-414111638411741",
        "name":  "TEXAS LINE DANCE",
        get displayName() { return _translateCopy("copy.b7dce6488768", { defaultValue: "TEXAS LINE DANCE" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fprod%2F922fbf95-c713-492b-930c-92df2fa32183.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2F6991d896-c53f-4713-a4be-52c29f4b0785.jpg",
        "motionSeconds":  10.069,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422649432008512",
        "name":  "Gesture Dance",
        get displayName() { return _translateCopy("copy.b55c932b3838", { defaultValue: "Gesture Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F917.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F917.jpg",
        "motionSeconds":  8.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423532357960000",
        "name":  "Zoo Dance Challenge",
        get displayName() { return _translateCopy("copy.bdcb13fc3184", { defaultValue: "Zoo Dance Challenge" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F6002.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F6002.jpg",
        "motionSeconds":  13.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-337572593925696",
        "name":  "Skeleton Dance",
        get displayName() { return _translateCopy("copy.7ff21b120803", { defaultValue: "Skeleton Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_skeleton_250513_2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_skeleton_250513.png",
        "motionSeconds":  8.520998,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-420171294385600",
        "name":  "Pet Dance Trainee",
        get displayName() { return _translateCopy("copy.ee356cd65459", { defaultValue: "Pet Dance Trainee" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F145.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F145.jpg",
        "motionSeconds":  11.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-420008694271296",
        "name":  "Cute Makka Pakka Dance",
        get displayName() { return _translateCopy("copy.1d33fb0fd65b", { defaultValue: "Cute Makka Pakka Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F121.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F121.jpg",
        "motionSeconds":  10.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-414113737169083",
        "name":  "FESTIVAL DANCE",
        get displayName() { return _translateCopy("copy.09d6519f9579", { defaultValue: "FESTIVAL DANCE" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fbdfda33f-9ed9-4b04-bb1e-f4490f60ae2b.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2F94ddedd8-438e-4d8b-a1d1-823cbbd3b3e5.jpg",
        "motionSeconds":  10.033333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-418094188948608",
        "name":  "Scuba dance！",
        get displayName() { return _translateCopy("copy.f1c245ae7a23", { defaultValue: "Scuba dance！" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fscubafanxin_260809.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fscubafanxin_260809.jpg",
        "motionSeconds":  5.566667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423224392010880",
        "name":  "Fashion Street Dance",
        get displayName() { return _translateCopy("copy.823381be89f0", { defaultValue: "Fashion Street Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F1993.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F1993.jpg",
        "motionSeconds":  11.708333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422472555206720",
        "name":  "Finger controlled dance",
        get displayName() { return _translateCopy("copy.0b75f3c98227", { defaultValue: "Finger controlled dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F859.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F859.jpg",
        "motionSeconds":  8.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422149553389952",
        "name":  "this_was_HERstory Dance",
        get displayName() { return _translateCopy("copy.b8f8a19c1c17", { defaultValue: "this_was_HERstory Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F710.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F710.jpg",
        "motionSeconds":  6.919002,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-419494522339520",
        "name":  "60s Dance Night",
        get displayName() { return _translateCopy("copy.7f2157e9ae99", { defaultValue: "60s Dance Night" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%BD%8E%E4%BF%97%E5%B0%8F%E8%AF%B43.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%BD%8E%E4%BF%97%E5%B0%8F%E8%AF%B43.jpg",
        "motionSeconds":  11.169002,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-419849352199488",
        "name":  "Doki Doki Dance",
        get displayName() { return _translateCopy("copy.2f285ed142e0", { defaultValue: "Doki Doki Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fdokidoki%E8%88%9E%E8%B9%88.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fdokidoki%E8%88%9E%E8%B9%88.jpg",
        "motionSeconds":  14.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-419496621990080",
        "name":  "Michico Dance Challenge",
        get displayName() { return _translateCopy("copy.dde0530f217f", { defaultValue: "Michico Dance Challenge" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%AE%A4%E5%86%85%E8%88%9E%E8%B9%88.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%AE%A4%E5%86%85%E8%88%9E%E8%B9%88.jpg",
        "motionSeconds":  14.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423224019936384",
        "name":  "Cute Dada Dance",
        get displayName() { return _translateCopy("copy.66d788101066", { defaultValue: "Cute Dada Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F1992.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F1992.jpg",
        "motionSeconds":  15.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-343058619202624",
        "name":  "Strikeout Dance",
        get displayName() { return _translateCopy("copy.d3ebc3fed645", { defaultValue: "Strikeout Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_3wave_250626.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_3wave_250626.png",
        "motionSeconds":  10.433333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-419518417078464",
        "name":  "Dynamic Dance",
        get displayName() { return _translateCopy("copy.bdcf015e2cd4", { defaultValue: "Dynamic Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E9%A9%AC%E5%8E%A9%E8%A7%86%E9%A2%91.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E9%A9%AC%E5%8E%A9%E8%A7%86%E9%A2%91.jpg",
        "motionSeconds":  11.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-421427527242048",
        "name":  "Old Town Road Dance",
        get displayName() { return _translateCopy("copy.d4ad8e3b898f", { defaultValue: "Old Town Road Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F559.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F559.jpg",
        "motionSeconds":  10.541667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422645223507776",
        "name":  "Dance With Minions",
        get displayName() { return _translateCopy("copy.1a90fda39306", { defaultValue: "Dance With Minions" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F908.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F908.jpg",
        "motionSeconds":  12.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-386548666174528",
        "name":  "Cannon Angel Dance",
        get displayName() { return _translateCopy("copy.762560719ce5", { defaultValue: "Cannon Angel Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E7%81%AB%E7%82%AE%E5%A4%A9%E4%BD%BF%E6%91%87.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E7%81%AB%E7%82%AE%E5%A4%A9%E4%BD%BF%E6%91%87.jpg",
        "motionSeconds":  9.666667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-421977263081472",
        "name":  "Bullfighting Dance",
        get displayName() { return _translateCopy("copy.ee84533836d4", { defaultValue: "Bullfighting Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fbull_260831.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fbull_260831.jpg",
        "motionSeconds":  14.070998,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-421431970853184",
        "name":  "Bigguy Karate Dance Challenge",
        get displayName() { return _translateCopy("copy.405d438698a8", { defaultValue: "Bigguy Karate Dance Challenge" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F557.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F557.jpg",
        "motionSeconds":  14.541667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422469880444992",
        "name":  "Shallow Dance: Bad Boy",
        get displayName() { return _translateCopy("copy.94dad1eabb62", { defaultValue: "Shallow Dance: Bad Boy" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F854.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F854.jpg",
        "motionSeconds":  12.875,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422328317801728",
        "name":  "Super Handsome Dance",
        get displayName() { return _translateCopy("copy.b7d4d00f5c1b", { defaultValue: "Super Handsome Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F812.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F812.jpg",
        "motionSeconds":  9.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423375773916096",
        "name":  "Handsome Dance: History",
        get displayName() { return _translateCopy("copy.7d904dd0e585", { defaultValue: "Handsome Dance: History" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F460.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F460.jpg",
        "motionSeconds":  14.708333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-421966178073920",
        "name":  "Powerful Dance: The Floow",
        get displayName() { return _translateCopy("copy.fdd4bbe78b15", { defaultValue: "Powerful Dance: The Floow" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F649.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F649.jpg",
        "motionSeconds":  14.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423223398247552",
        "name":  "Girl group dance",
        get displayName() { return _translateCopy("copy.6f0cf270ea4e", { defaultValue: "Girl group dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F1991.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F1991.jpg",
        "motionSeconds":  12.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423225362742400",
        "name":  "Twist Hip Dance",
        get displayName() { return _translateCopy("copy.c8d2c11104d6", { defaultValue: "Twist Hip Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F1995.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F1995.jpg",
        "motionSeconds":  11.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-423372261680064",
        "name":  "Twist Hip Magic Dance",
        get displayName() { return _translateCopy("copy.1d45ff358e9a", { defaultValue: "Twist Hip Magic Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F450.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F450.jpg",
        "motionSeconds":  12.875,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-420011846827328",
        "name":  "jazz dance:positions",
        get displayName() { return _translateCopy("copy.9228b8bb68f3", { defaultValue: "jazz dance:positions" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F116.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F116.jpg",
        "motionSeconds":  14.875,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-420696745231808",
        "name":  "Dance practice time",
        get displayName() { return _translateCopy("copy.212400eb3604", { defaultValue: "Dance practice time" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F55.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F55.jpg",
        "motionSeconds":  10.041667,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-420872229465536",
        "name":  "One Time Gesture Dance",
        get displayName() { return _translateCopy("copy.e70b34419360", { defaultValue: "One Time Gesture Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F64.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F64.jpg",
        "motionSeconds":  14.375,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-422337309832832",
        "name":  "Never-Fading Dance",
        get displayName() { return _translateCopy("copy.42ddbdba18d5", { defaultValue: "Never-Fading Dance" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmasa_260902.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmasa_260902.jpg",
        "motionSeconds":  14.000998,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    },
    {
        "id":  "motion-421959977571648",
        "name":  "A Dance Full of Vitality: Way Back Home",
        get displayName() { return _translateCopy("copy.106bc47d2d93", { defaultValue: "A Dance Full of Vitality: Way Back Home" }); },
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F635.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F635.jpg",
        "motionSeconds":  10.208333,
        "sourceName":  "PixVerse",
        "sourceUrl":  "https://app.pixverse.ai/?tab=template"
    }
];
export const VIRAL_TEMPLATES: ViralTemplate[] = [...VIRAL_MOTION_TEMPLATES, ...VIRAL_EFFECTS];
export const viralTemplate = (id?: string) => VIRAL_TEMPLATES.find(item => item.id === id);
export const MOTION_TEMPLATE_PROMPT = 'Use the person or character in the reference image. Reproduce the movement, timing, gestures and camera framing of the reference video. Keep the reference character consistent throughout. Preserve the scene from the video.';
export const TEMPLATE_FEATURED_IDS = ['jean-phil-night-selfie', 'jean-phil-the-steps', 'motion-343058274917440', 'jean-phil-office-dance', 'motion-403739217192896', 'jean-phil-living-room', 'motion-427124747250112', 'earth-zoom', 'ghostface-terror', 'fin-tastic-mermaid', 'jean-phil-street-dance'];