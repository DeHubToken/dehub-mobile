/** Exact effect names from fal's PixVerse v5.5 schema, checked 2026-10-13.
 * Matching previews are supplied by PixVerse's public template catalog.
 * No popularity ranking is inferred. Missing previews are never substituted.
 * Sources: https://fal.ai/models/fal-ai/pixverse/v5.5/effects/api
 * https://app.pixverse.ai/?tab=template
 */
export interface ViralEffect {
  id: string;
  name: string;
  category: 'effects' | 'characters' | 'dance' | 'products' | 'seasonal' | 'sports';
  preview?: string;
  poster?: string;
  providerTemplateId?: string;
}
export const VIRAL_EFFECT_MODEL = 'pixverse-effects';
export const VIRAL_EFFECTS: ViralEffect[] = [
    {
        "id":  "kiss-me-ai",
        "name":  "Kiss Me AI",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_ailover_250212.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_ailover_250212.png",
        "providerTemplateId":  "321958627120000"
    },
    {
        "id":  "kiss",
        "name":  "Kiss",
        "category":  "effects"
    },
    {
        "id":  "muscle-surge",
        "name":  "Muscle Surge",
        "category":  "effects"
    },
    {
        "id":  "warmth-of-jesus",
        "name":  "Warmth of Jesus",
        "category":  "characters"
    },
    {
        "id":  "anything-robot",
        "name":  "Anything, Robot",
        "category":  "characters"
    },
    {
        "id":  "the-tiger-touch",
        "name":  "The Tiger Touch",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_tigerhug_250127.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_tigerhug_250127.png",
        "providerTemplateId":  "313649491716544"
    },
    {
        "id":  "hug",
        "name":  "Hug",
        "category":  "effects"
    },
    {
        "id":  "holy-wings",
        "name":  "Holy Wings",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_anglewings_250210_1.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_anglewings_250210_1.png",
        "providerTemplateId":  "313649622731200"
    },
    {
        "id":  "microwave",
        "name":  "Microwave",
        "category":  "effects"
    },
    {
        "id":  "zombie-mode",
        "name":  "Zombie Mode",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_zombiemode_0114.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_zombiemode_0114.png",
        "providerTemplateId":  "302325299651648"
    },
    {
        "id":  "squid-game",
        "name":  "Squid Game",
        "category":  "characters"
    },
    {
        "id":  "baby-face",
        "name":  "Baby Face",
        "category":  "characters"
    },
    {
        "id":  "black-myth-wukong",
        "name":  "Black Myth: Wukong",
        "category":  "characters"
    },
    {
        "id":  "long-hair-magic",
        "name":  "Long Hair Magic",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Flonghair_250715.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_hairgrowth_0114.png",
        "providerTemplateId":  "308552687706496"
    },
    {
        "id":  "leggy-run",
        "name":  "Leggy Run",
        "category":  "effects"
    },
    {
        "id":  "fin-tastic-mermaid",
        "name":  "Fin-tastic Mermaid",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_mermaid_250528.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_mermaid_250528.png",
        "providerTemplateId":  "340541567573824"
    },
    {
        "id":  "punch-face",
        "name":  "Punch Face",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_punch_250515_2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_punch_250515.png",
        "providerTemplateId":  "338083197718400"
    },
    {
        "id":  "creepy-devil-smile",
        "name":  "Creepy Devil Smile",
        "category":  "characters"
    },
    {
        "id":  "thunder-god",
        "name":  "Thunder God",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_thunder_250527.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_thunder_250527.png",
        "providerTemplateId":  "340383170699072"
    },
    {
        "id":  "eye-zoom-challenge",
        "name":  "Eye Zoom Challenge",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_eye_250524.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_eye_250524.png",
        "providerTemplateId":  "339848996187712"
    },
    {
        "id":  "who-s-arrested",
        "name":  "Who\u0027s Arrested?",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_arrest_250610.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_arrest_250610.png",
        "providerTemplateId":  "342847495240768"
    },
    {
        "id":  "baby-arrived",
        "name":  "Baby Arrived",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_getbaby_250611.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_getbaby_250611.png",
        "providerTemplateId":  "342874383633472"
    },
    {
        "id":  "werewolf-rage",
        "name":  "Werewolf Rage",
        "category":  "characters"
    },
    {
        "id":  "bald-swipe",
        "name":  "Bald Swipe",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmonkey-1107.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmonkey.png",
        "providerTemplateId":  "340361643937600"
    },
    {
        "id":  "boom-drop",
        "name":  "BOOM DROP",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_explode_250520.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_explode_250520.png",
        "providerTemplateId":  "339133943656192"
    },
    {
        "id":  "huge-cutie",
        "name":  "Huge Cutie",
        "category":  "characters"
    },
    {
        "id":  "liquid-metal",
        "name":  "Liquid Metal",
        "category":  "effects"
    },
    {
        "id":  "sharksnap",
        "name":  "Sharksnap!",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_shark_250617.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_shark_250617.png",
        "providerTemplateId":  "344131642438080"
    },
    {
        "id":  "dust-me-away",
        "name":  "Dust Me Away",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_part_250618.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_part_250618.png",
        "providerTemplateId":  "344080941597120"
    },
    {
        "id":  "3d-figurine-factor",
        "name":  "3D Figurine Factor",
        "category":  "characters"
    },
    {
        "id":  "bikini-up",
        "name":  "Bikini Up",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_bikini_250218.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_bikini_250218.png",
        "providerTemplateId":  "313555098280384"
    },
    {
        "id":  "my-girlfriends",
        "name":  "My Girlfriends",
        "category":  "effects"
    },
    {
        "id":  "my-boyfriends",
        "name":  "My Boyfriends",
        "category":  "effects"
    },
    {
        "id":  "subject-3-fever",
        "name":  "Subject 3 Fever",
        "category":  "dance"
    },
    {
        "id":  "earth-zoom",
        "name":  "Earth Zoom",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_earthzoom_250716.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_earthzoom_250716.png",
        "providerTemplateId":  "349110259052160"
    },
    {
        "id":  "pole-dance",
        "name":  "Pole Dance",
        "category":  "dance"
    },
    {
        "id":  "vroom-dance",
        "name":  "Vroom Dance",
        "category":  "dance"
    },
    {
        "id":  "ghostface-terror",
        "name":  "GhostFace Terror",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_scream_250930.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_scream_250930.jpg",
        "providerTemplateId":  "362704938833536"
    },
    {
        "id":  "dragon-evoker",
        "name":  "Dragon Evoker",
        "category":  "characters"
    },
    {
        "id":  "skeletal-bae",
        "name":  "Skeletal Bae",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_deadlover_251017.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_deadlover_251017.jpg",
        "providerTemplateId":  "365519260162816"
    },
    {
        "id":  "summoning-succubus",
        "name":  "Summoning succubus",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_summoningsuccubusxiugai_251017.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_summoningsuccubus_251017.png",
        "providerTemplateId":  "365522752365312"
    },
    {
        "id":  "halloween-voodoo-doll",
        "name":  "Halloween Voodoo Doll",
        "category":  "characters"
    },
    {
        "id":  "3d-naked-eye-ad",
        "name":  "3D Naked-Eye AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F3D%E8%A3%B8%E7%9C%BC%E5%B9%BF%E5%91%8A1.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F3D%E8%A3%B8%E7%9C%BC%E5%B9%BF%E5%91%8A1.jpg",
        "providerTemplateId":  "365496187695872"
    },
    {
        "id":  "package-explosion",
        "name":  "Package Explosion",
        "category":  "products"
    },
    {
        "id":  "dishes-served",
        "name":  "Dishes Served",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E7%BE%8E%E9%A3%9F%E7%9B%9B%E5%AE%B41.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E7%BE%8E%E9%A3%9F%E7%9B%9B%E5%AE%B41.jpg",
        "providerTemplateId":  "364657798257408"
    },
    {
        "id":  "ocean-ad",
        "name":  "Ocean ad",
        "category":  "products"
    },
    {
        "id":  "supermarket-ad",
        "name":  "Supermarket AD",
        "category":  "products"
    },
    {
        "id":  "tree-doll",
        "name":  "Tree doll",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_treedoll1_251204.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_treedoll1_251204.jpg",
        "providerTemplateId":  "374166107631104"
    },
    {
        "id":  "come-feel-my-abs",
        "name":  "Come Feel My Abs",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fprod%2F82006403-5659-4b27-a627-0bfbf78d026b.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2Fa6b52dd4-f9f1-4afd-9502-5e7b399c8f9a.jpg",
        "providerTemplateId":  "370472489673650"
    },
    {
        "id":  "the-bicep-flex",
        "name":  "The Bicep Flex",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fprod%2F9340e806-4df0-416b-99e0-f182ef65376a.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2F44cc7df8-704e-41d1-ab67-5d22bc498b29.jpg",
        "providerTemplateId":  "370476424049609"
    },
    {
        "id":  "london-elite-vibe",
        "name":  "London Elite Vibe",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fprod%2Fa5c94d94-38c6-4709-868a-c851ad88c474.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2F6c73131f-3c76-4a5f-9787-c5cc11c3fe90.jpg",
        "providerTemplateId":  "372921784232832"
    },
    {
        "id":  "flora-nymph-gown",
        "name":  "Flora Nymph Gown",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_flower_251128_2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_flower_251128_2.jpg",
        "providerTemplateId":  "372980970645589"
    },
    {
        "id":  "christmas-costume",
        "name":  "Christmas Costume",
        "category":  "seasonal"
    },
    {
        "id":  "it-s-snowy",
        "name":  "It\u0027s Snowy",
        "category":  "seasonal"
    },
    {
        "id":  "reindeer-cruiser",
        "name":  "Reindeer Cruiser",
        "category":  "seasonal"
    },
    {
        "id":  "snow-globe-maker",
        "name":  "Snow Globe Maker",
        "category":  "seasonal"
    },
    {
        "id":  "pet-christmas-outfit",
        "name":  "Pet Christmas Outfit",
        "category":  "characters"
    },
    {
        "id":  "adopt-a-polar-pal",
        "name":  "Adopt a Polar Pal",
        "category":  "characters"
    },
    {
        "id":  "cat-christmas-box",
        "name":  "Cat Christmas Box",
        "category":  "characters"
    },
    {
        "id":  "starlight-gift-box",
        "name":  "Starlight Gift Box",
        "category":  "seasonal"
    },
    {
        "id":  "xmas-poster",
        "name":  "Xmas Poster",
        "category":  "products"
    },
    {
        "id":  "pet-christmas-tree",
        "name":  "Pet Christmas Tree",
        "category":  "characters"
    },
    {
        "id":  "city-santa-hat",
        "name":  "City Santa Hat",
        "category":  "seasonal"
    },
    {
        "id":  "stocking-sweetie",
        "name":  "Stocking Sweetie",
        "category":  "seasonal"
    },
    {
        "id":  "christmas-night",
        "name":  "Christmas Night",
        "category":  "seasonal",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fappchristmassparkleentrance_251210.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fappchristmassparkleentrance_251210.jpg",
        "providerTemplateId":  "375297572099008"
    },
    {
        "id":  "xmas-front-page-karma",
        "name":  "Xmas Front Page Karma",
        "category":  "seasonal",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_xmasnews_251210.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_xmasnews_251210.jpg",
        "providerTemplateId":  "375277260704704"
    },
    {
        "id":  "grinch-s-xmas-hijack",
        "name":  "Grinch\u0027s Xmas Hijack",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_grinch_251208_2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_grinch_251208_2.jpg",
        "providerTemplateId":  "374871723655616"
    },
    {
        "id":  "giant-product",
        "name":  "Giant Product",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%B7%A8%E5%A4%A7%E8%A1%97%E5%A4%B4%E4%BA%A7%E5%93%811.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%B7%A8%E5%A4%A7%E8%A1%97%E5%A4%B4%E4%BA%A7%E5%93%811.jpg",
        "providerTemplateId":  "368493233725888"
    },
    {
        "id":  "truck-fashion-shoot",
        "name":  "Truck Fashion Shoot",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E8%B4%A7%E8%BD%A6%E6%97%B6%E5%B0%9A%E5%B9%BF%E5%91%8A2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E8%B4%A7%E8%BD%A6%E6%97%B6%E5%B0%9A%E5%B9%BF%E5%91%8A2.jpg",
        "providerTemplateId":  "364641000073984"
    },
    {
        "id":  "beach-ad",
        "name":  "Beach AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%B2%99%E6%BB%A92.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%B2%99%E6%BB%A92.jpg",
        "providerTemplateId":  "368492376619456"
    },
    {
        "id":  "shoal-surround",
        "name":  "Shoal Surround",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E9%B1%BC%E7%BE%A4%E7%8E%AF%E7%BB%951.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E9%B1%BC%E7%BE%A4%E7%8E%AF%E7%BB%951.jpg",
        "providerTemplateId":  "366949275773760"
    },
    {
        "id":  "mechanical-assembly",
        "name":  "Mechanical Assembly",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%9C%BA%E6%A2%B0%E7%BB%84%E8%A3%851.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%9C%BA%E6%A2%B0%E7%BB%84%E8%A3%851.jpg",
        "providerTemplateId":  "369281788356224"
    },
    {
        "id":  "lighting-ad",
        "name":  "Lighting AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%85%89%E5%BD%B1%E6%B0%B4%E6%B3%A2%E7%BA%B91.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%85%89%E5%BD%B1%E6%B0%B4%E6%B3%A2%E7%BA%B91.jpg",
        "providerTemplateId":  "366951955215168"
    },
    {
        "id":  "billboard-ad",
        "name":  "Billboard AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%85%AC%E8%B7%AF%E5%B9%BF%E5%91%8A%E7%89%8C1.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%85%AC%E8%B7%AF%E5%B9%BF%E5%91%8A%E7%89%8C1.jpg",
        "providerTemplateId":  "368493579993536"
    },
    {
        "id":  "product-close-up",
        "name":  "Product close-up",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%B8%9D%E7%BB%B8%E7%8E%AF%E5%A2%831.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%B8%9D%E7%BB%B8%E7%8E%AF%E5%A2%831.jpg",
        "providerTemplateId":  "368492855374272"
    },
    {
        "id":  "parachute-delivery",
        "name":  "Parachute Delivery",
        "category":  "products"
    },
    {
        "id":  "dreamlike-cloud",
        "name":  "Dreamlike Cloud",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%BA%91%E6%9C%B5%E5%B9%BF%E5%91%8A1.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E4%BA%91%E6%9C%B5%E5%B9%BF%E5%91%8A1.jpg",
        "providerTemplateId":  "366950737546048"
    },
    {
        "id":  "macaron-machine",
        "name":  "Macaron Machine",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%89%AD%E8%9B%8B%E6%9C%BA%E7%88%86%E7%82%B8%E5%B9%BF%E5%91%8A1.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E6%89%AD%E8%9B%8B%E6%9C%BA%E7%88%86%E7%82%B8%E5%B9%BF%E5%91%8A1.jpg",
        "providerTemplateId":  "366950091449152"
    },
    {
        "id":  "poster-ad",
        "name":  "Poster AD",
        "category":  "products"
    },
    {
        "id":  "truck-ad",
        "name":  "Truck AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%8D%A1%E8%BD%A6%E5%B9%BF%E5%91%8A%C2%B7.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%8D%A1%E8%BD%A6%E5%B9%BF%E5%91%8A%C2%B7.jpg",
        "providerTemplateId":  "361428766080064"
    },
    {
        "id":  "graffiti-ad",
        "name":  "Graffiti AD",
        "category":  "products",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp-graffitiad_251109.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp-graffitiad_251109-%E5%B0%81%E9%9D%A2.jpg",
        "providerTemplateId":  "361429094298688"
    },
    {
        "id":  "3d-figurine-factory",
        "name":  "3D Figurine Factory",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp-3d-251107.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp-3d-251107.jpg",
        "providerTemplateId":  "358817882065344"
    },
    {
        "id":  "the-exclusive-first-class",
        "name":  "The Exclusive First Class",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_theexclusivefirstclass_251029.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_theexclusivefirstclass_251029.jpg",
        "providerTemplateId":  "367845183423296"
    },
    {
        "id":  "art-zoom-challenge",
        "name":  "Art Zoom Challenge",
        "category":  "effects"
    },
    {
        "id":  "i-quit",
        "name":  "I Quit",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_iquit_251023.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_iquit_251023.jpg",
        "providerTemplateId":  "366773399804864"
    },
    {
        "id":  "hitchcock-dolly-zoom",
        "name":  "Hitchcock Dolly Zoom",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_hitchcock_2500622.mov",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_hitchcock_2500622.png",
        "providerTemplateId":  "343430955683776"
    },
    {
        "id":  "smell-the-lens",
        "name":  "Smell the Lens",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_fisheye_250720.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_fisheye_250720.png",
        "providerTemplateId":  "349597743799936"
    },
    {
        "id":  "i-believe-i-can-fly",
        "name":  "I believe I can fly",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Ffly_250917.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Ffly_250917.jpg",
        "providerTemplateId":  "350827863568000"
    },
    {
        "id":  "strikout-dance",
        "name":  "Strikout Dance",
        "category":  "dance"
    },
    {
        "id":  "courtside-cam",
        "name":  "Courtside Cam",
        "category":  "sports"
    },
    {
        "id":  "pit-crew-moment",
        "name":  "Pit Crew Moment",
        "category":  "sports",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2FPixVerse_V6_Image_Text_1080P_Create_a_short_li+%282%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2FPixVerse_V6_Image_Text_1080P_Create_a_short_li+%282%29.jpg",
        "providerTemplateId":  "402687993764864"
    },
    {
        "id":  "k-baseball-sprint",
        "name":  "K-Baseball Sprint",
        "category":  "sports",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fbaseball-fixed0519.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fbaseball-fixed0519.jpg",
        "providerTemplateId":  "402347545695296"
    },
    {
        "id":  "toddler-doodle",
        "name":  "Toddler Doodle",
        "category":  "effects"
    },
    {
        "id":  "idol-ending",
        "name":  "Idol Ending",
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8822%E6%97%A5.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8822%E6%97%A5.jpg",
        "providerTemplateId":  "403560060358144"
    },
    {
        "id":  "apex-dance",
        "name":  "Apex Dance",
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8820%E6%97%A5%281%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F5%E6%9C%8820%E6%97%A5%281%29.jpg",
        "providerTemplateId":  "403739217192896"
    },
    {
        "id":  "omnihero-forge",
        "name":  "OmniHero Forge",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2FomniHeroforge_260430.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2FomniHeroforge_260430.jpg",
        "providerTemplateId":  "400222977706432"
    },
    {
        "id":  "palm-decode",
        "name":  "Palm Decode",
        "category":  "effects"
    },
    {
        "id":  "the-age-ripple",
        "name":  "The Age Ripple",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fage-0518.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fage-0518.jpg",
        "providerTemplateId":  "402877584470208"
    },
    {
        "id":  "my-future-is-limitless",
        "name":  "My Future Is Limitless",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmyfutureislimitless_260521.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fmyfutureislimitless_260521.jpg",
        "providerTemplateId":  "403916646846400"
    },
    {
        "id":  "knee-slide",
        "name":  "Knee Slide",
        "category":  "sports"
    },
    {
        "id":  "epic-goal-save",
        "name":  "Epic Goal Save",
        "category":  "sports"
    },
    {
        "id":  "sideline-ball-boy",
        "name":  "Sideline Ball Boy",
        "category":  "sports"
    },
    {
        "id":  "cup-celebration",
        "name":  "Cup Celebration",
        "category":  "sports",
        "preview":  "https://media.pixverse.ai/studio%2Fvideo%2Fprod%2F8d86fb60-377d-4426-b129-42c9c0ebd763.mp4",
        "poster":  "https://media.pixverse.ai/studio%2Fimg%2F8fab03a1-112b-4692-bed1-52968eebfa11.jpg",
        "providerTemplateId":  "402061828030966"
    },
    {
        "id":  "victory-roar",
        "name":  "Victory Roar",
        "category":  "sports"
    },
    {
        "id":  "vuvuzela-fan",
        "name":  "Vuvuzela Fan",
        "category":  "sports"
    },
    {
        "id":  "world-champion-lift",
        "name":  "World Champion Lift",
        "category":  "sports"
    },
    {
        "id":  "tunnel-to-captain",
        "name":  "Tunnel to Captain",
        "category":  "sports"
    },
    {
        "id":  "liquid-soccer-morph",
        "name":  "Liquid Soccer Morph",
        "category":  "sports"
    },
    {
        "id":  "jump-into-crowd-2",
        "name":  "Jump Into Crowd 2",
        "category":  "sports"
    },
    {
        "id":  "golden-pitch-crasher",
        "name":  "Golden Pitch Crasher",
        "category":  "sports"
    },
    {
        "id":  "stadium-fan-cam",
        "name":  "Stadium Fan Cam",
        "category":  "sports"
    },
    {
        "id":  "broadcast-moto-gp",
        "name":  "Broadcast Moto GP",
        "category":  "sports"
    },
    {
        "id":  "the-grotesque-clay",
        "name":  "The Grotesque Clay",
        "category":  "characters"
    },
    {
        "id":  "rookie-star-card",
        "name":  "Rookie Star Card",
        "category":  "effects"
    },
    {
        "id":  "the-final-hug",
        "name":  "The Final Hug",
        "category":  "effects"
    },
    {
        "id":  "sharp-post-match-comment",
        "name":  "Sharp Post-Match Comment",
        "category":  "effects"
    },
    {
        "id":  "street-maverick",
        "name":  "Street Maverick",
        "category":  "effects"
    },
    {
        "id":  "pitch-legend",
        "name":  "Pitch Legend",
        "category":  "sports",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fpitchlegend_260531.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fpitchlegend_260531.jpg",
        "providerTemplateId":  "405658369331648"
    },
    {
        "id":  "one-step-at-a-time",
        "name":  "One Step At A Time",
        "category":  "dance",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fonestepatatime_260529.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fonestepatatime_260529.jpg",
        "providerTemplateId":  "405321470423488"
    },
    {
        "id":  "birthday-mirror",
        "name":  "Birthday Mirror",
        "category":  "effects"
    },
    {
        "id":  "superstar-lobby",
        "name":  "Superstar Lobby",
        "category":  "effects"
    },
    {
        "id":  "final-battle-room",
        "name":  "Final Battle Room",
        "category":  "effects"
    },
    {
        "id":  "top-of-the-world",
        "name":  "Top of the World",
        "category":  "effects"
    },
    {
        "id":  "mini-me-unboxed",
        "name":  "Mini Me Unboxed",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F7.24-Mini+Me+Unboxed+5.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F7.24-Mini+Me+Unboxed+9.png",
        "providerTemplateId":  "414714760096768"
    },
    {
        "id":  "wonderpop-surprise",
        "name":  "WonderPOP Surprise",
        "category":  "effects"
    },
    {
        "id":  "white-chicks",
        "name":  "White Chicks",
        "category":  "effects"
    },
    {
        "id":  "kiss-me",
        "name":  "Kiss me",
        "category":  "effects"
    },
    {
        "id":  "what-a-day",
        "name":  "What a Day",
        "category":  "effects"
    },
    {
        "id":  "the-last-leap-at-sunset",
        "name":  "The Last Leap at Sunset",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%BE%AE%E4%BF%A1%E8%A7%86%E9%A2%912026-07-31_182502_763.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fpixverse_i2i_ori_8680d0c7-4286-41fa-90ad-1ceca6678c4a.png",
        "providerTemplateId":  "416504334886464"
    },
    {
        "id":  "tiny-sticker-chef-chaos",
        "name":  "Tiny Sticker Chef Chaos",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F7%E6%9C%8828%E6%97%A5_%281%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F7%E6%9C%8828%E6%97%A5_%281%29.jpg",
        "providerTemplateId":  "416276364653376"
    },
    {
        "id":  "mini-squeeze-toy",
        "name":  "Mini Squeeze Toy",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fautoteml_y2fc6x_jp_8%E6%9C%884%E6%97%A5%281%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fautoteml_y2fc6x_jp_PixVerse_Image_Effect_prompt_%E9%AB%98%E6%B8%85.png",
        "providerTemplateId":  "427124917875136"
    },
    {
        "id":  "tearful-gunman",
        "name":  "Tearful Gunman",
        "category":  "effects"
    },
    {
        "id":  "street-fashion-caricature",
        "name":  "Street Fashion Caricature",
        "category":  "characters"
    },
    {
        "id":  "mini-me-makeover",
        "name":  "Mini Me Makeover",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F0802-Mini+Me+Makeover+.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F0802-Mini+Me+Makeover+.jpg",
        "providerTemplateId":  "416808623273536"
    },
    {
        "id":  "street-art-awakening",
        "name":  "Street Art Awakening",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F8.3%E8%A1%97%E5%A4%B4000.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F8.3%E8%A1%97%E5%A4%B4000.jpg",
        "providerTemplateId":  "417033902416768"
    },
    {
        "id":  "hug-together",
        "name":  "Hug Together",
        "category":  "effects"
    },
    {
        "id":  "acai-dance-duet",
        "name":  "ACAI dance Duet",
        "category":  "dance"
    },
    {
        "id":  "pubg-winner-hit",
        "name":  "PUBG Winner Hit!",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_winnerdance_250513.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_winnerdance_250513.png",
        "providerTemplateId":  "337792714792704"
    },
    {
        "id":  "blocky-mini-me",
        "name":  "Blocky Mini-Me",
        "category":  "characters"
    },
    {
        "id":  "cheat-day-busted",
        "name":  "Cheat Day Busted",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2FXIAORENpaobu.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2FXIAORENpaobu.jpg",
        "providerTemplateId":  "413344200633408"
    },
    {
        "id":  "minisocial-recharge",
        "name":  "MiniSocial Recharge",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2FDEMO3.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F7%E6%9C%8827%E6%97%A5+%281%29%281%29.png",
        "providerTemplateId":  "415569730590656"
    },
    {
        "id":  "my-little-perler-charm",
        "name":  "My Little Perler Charm",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fdemo2.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F8%E6%9C%8813%E6%97%A5+%281%29.png",
        "providerTemplateId":  "418815439392256"
    },
    {
        "id":  "where-did-this-cobweb-come-from",
        "name":  "Where did this cobweb come from?",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2FPixVerse_V6_Effect_720P_Upload_your_photo_and_.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E8%A7%86%E9%A2%91_41_%281%29+%281%29.jpg",
        "providerTemplateId":  "418800954072576"
    },
    {
        "id":  "holy-beast-summoning-technique",
        "name":  "Holy Beast Summoning Technique",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fai%E9%80%9A%E7%81%B5%E6%9C%AF.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fai%E9%80%9A%E7%81%B5%E6%9C%AF.jpg",
        "providerTemplateId":  "418801639489024"
    },
    {
        "id":  "it-s-the-first-of-the-month",
        "name":  "IT\u0027S THE FIRST OF THE MONTH",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F8%E6%9C%8812%E6%97%A5_%281%29.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F8%E6%9C%8812%E6%97%A5_%281%29.jpg",
        "providerTemplateId":  "418798312359424"
    },
    {
        "id":  "pet-editorial",
        "name":  "Pet Editorial",
        "category":  "characters",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%AE%A0%E7%89%A9%E6%9D%82%E5%BF%97.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2F%E5%AE%A0%E7%89%A9%E6%9D%82%E5%BF%97.jpg",
        "providerTemplateId":  "419113983637696"
    },
    {
        "id":  "three-lifetime-bond",
        "name":  "Three lifetime bond",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fthree+lifetime+bond.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fthree+lifetime+bond.jpg",
        "providerTemplateId":  "418934356626944"
    },
    {
        "id":  "pixel-world",
        "name":  "Pixel World",
        "category":  "characters"
    },
    {
        "id":  "mint-in-box",
        "name":  "Mint in Box",
        "category":  "characters"
    },
    {
        "id":  "hands-up-hand",
        "name":  "Hands up, Hand",
        "category":  "effects"
    },
    {
        "id":  "flora-nymph-go",
        "name":  "Flora Nymph Go",
        "category":  "effects"
    },
    {
        "id":  "somber-embrace",
        "name":  "Somber Embrace",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_blackwings_0609.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_blackwings_0609.png",
        "providerTemplateId":  "342538347747072"
    },
    {
        "id":  "beam-me-up",
        "name":  "Beam me up",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_blue_250725.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_blue_250725.jpg",
        "providerTemplateId":  "350827688007296"
    },
    {
        "id":  "suit-swagger",
        "name":  "Suit Swagger",
        "category":  "effects",
        "preview":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_suit_250324.mp4",
        "poster":  "https://media.pixverse.ai/asset%2Ftemplate%2Fapp_suit_250321.jpg",
        "providerTemplateId":  "328545151283968"
    }
];
export const VIRAL_FEATURED_IDS = ['earth-zoom', 'fin-tastic-mermaid', 'eye-zoom-challenge', 'apex-dance', 'omnihero-forge', 'ghostface-terror', 'mini-me-makeover', 'holy-wings'];
export const viralEffect = (id?: string | null) => VIRAL_EFFECTS.find(effect => effect.id === id);