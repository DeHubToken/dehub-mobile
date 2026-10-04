/**
 * 3D Model Generation Configuration
 * =================================
 * Mesh generation runs on fal.ai, which DeHub already pays for (FAL_KEY), so
 * this rides the same queue-submit / poll contract the video models use rather
 * than introducing a second provider.
 *
 * Every endpoint id here was read off the fal.ai API docs — they are not
 * interchangeable and the field names differ per family, so the mapping to a
 * request body lives in the generate-3d edge function, not here.
 *
 * ── On `baseCostUsd` ─────────────────────────────────────────────────────────
 * fal.ai does not publish a per-generation price on the 3D model pages the way
 * it does for video, so these are deliberately CONSERVATIVE (rounded up)
 * estimates. They set what a creator is charged, at the shared 20% markup, so
 * erring high means the platform is never underwater on a generation. Reconcile
 * them against a real fal.ai invoice after the first week of traffic and adjust
 * — a number that is too high is a pricing decision, a number that is too low
 * is a loss on every mesh.
 */

export type Model3dMode = 'text-to-3d' | 'image-to-3d';

export interface Model3dModel {
  id: string;
  name: string;
  description: string;
  supports: Model3dMode[];
  tier: 'premium' | 'standard' | 'fast';
  emoji: string;
  /** Base cost in USD before markup. See the note above — estimated, not published. */
  baseCostUsd: number;
  /** Surcharge applied when standard textures are requested. */
  texturedMultiplier?: number;
  /**
   * Surcharge for HD textures. Falls back to texturedMultiplier when unset.
   *
   * This exists because the providers really do bill more for it, so charging
   * the standard price for an HD mesh eats the margin on every one.
   */
  hdMultiplier?: number;
  /** Whether the model can bake textures at all. */
  supportsTexture?: boolean;
  /** Whether the model can emit PBR material maps (metallic / roughness / normal). */
  supportsPbr?: boolean;
  /** Whether a target polygon budget can be requested. */
  supportsFaceLimit?: boolean;
  /** Whether quad topology is available (nicer for anyone editing the mesh after). */
  supportsQuad?: boolean;
  /** Whether a seed can be pinned for reproducible output. */
  supportsSeed?: boolean;
  /** Whether the model accepts a negative prompt. */
  supportsNegativePrompt?: boolean;
  /** Export formats beyond GLB, when the provider offers them. */
  exportFormats?: string[];
  /** How many reference images the model reads. */
  maxReferenceImages?: number;
  /**
   * Whether the model reads the prompt alongside an attached image.
   *
   * Most do not: their image-to-3D endpoints have no prompt field at all, so
   * typed instructions are dropped on the floor. The composer says so rather
   * than letting someone pay for an edit the model was never told about.
   */
  usesPromptWithImage?: boolean;
  /** Rough wall-clock, shown so nobody thinks a 2-minute mesh has hung. */
  typicalDuration: string;
  tips?: string[];
}

/** Markup percentage (20% = 1.2x cost), matching image and video generation. */
export const MODEL3D_GENERATION_MARKUP = 0.2;

/**
 * Final USD cost with markup.
 *
 * Takes the texture quality rather than a boolean, because the providers bill
 * three different amounts for it and the modal must charge what it displays.
 */
export const getModel3dCostUsd = (
  model: Model3dModel,
  quality: TextureQuality = 'standard',
): number => {
  const multiplier =
    quality === 'none'
      ? 1
      : quality === 'HD'
        ? (model.hdMultiplier ?? model.texturedMultiplier ?? 1)
        : (model.texturedMultiplier ?? 1);
  return model.baseCostUsd * multiplier * (1 + MODEL3D_GENERATION_MARKUP);
};

/** Cost in DHB at the live price. */
export const getModel3dCostDhb = (
  model: Model3dModel,
  dhbPriceUsd: number,
  quality: TextureQuality = 'standard',
): number => {
  if (dhbPriceUsd <= 0) return 0;
  return getModel3dCostUsd(model, quality) / dhbPriceUsd;
};

export const MODEL3D_MODELS: Record<string, Model3dModel> = {
  'tripo-2.5': {
    id: 'tripo-2.5',
    name: 'Tripo 2.5',
    description: 'Best all-round mesh, text or image',
    supports: ['text-to-3d', 'image-to-3d'],
    tier: 'premium',
    emoji: '🗿',
    baseCostUsd: 0.2,
    // Tripo bills HD texturing above standard; untextured is the base rate.
    hdMultiplier: 1.5,
    supportsTexture: true,
    supportsPbr: true,
    supportsFaceLimit: true,
    supportsQuad: true,
    supportsSeed: true,
    supportsNegativePrompt: true,
    maxReferenceImages: 1,
    typicalDuration: '1-3 min',
    tips: [
      '🗿 The safe default — clean topology and reliable texturing',
      '🖼️ Attach an image for a much closer match than text alone',
      '📐 Quad topology if you plan to edit the mesh in Blender',
      '🎨 HD textures cost more but hold up close to camera',
    ],
  },
  'hunyuan3d-v2': {
    id: 'hunyuan3d-v2',
    name: 'Hunyuan3D 2.0',
    description: 'Tencent, sharp geometry from one image',
    supports: ['image-to-3d'],
    tier: 'standard',
    emoji: '🌏',
    baseCostUsd: 0.06,
    texturedMultiplier: 3,
    supportsTexture: true,
    supportsSeed: true,
    maxReferenceImages: 1,
    typicalDuration: '1-2 min',
    tips: [
      '🌏 Strongest geometry for the price',
      '🖼️ Needs an image — it has no text-to-3D path',
      '⚪ Untextured is a third of the price; texture only when you need it',
      '🔍 Higher octree resolution sharpens detail and costs render time',
    ],
  },
  trellis: {
    id: 'trellis',
    name: 'TRELLIS',
    description: 'Fast image-to-mesh, good for iteration',
    supports: ['image-to-3d'],
    tier: 'fast',
    emoji: '⚡',
    baseCostUsd: 0.08,
    // Larger texture maps cost more compute time on the same endpoint.
    hdMultiplier: 1.4,
    supportsTexture: true,
    supportsSeed: true,
    maxReferenceImages: 1,
    typicalDuration: '30-60 s',
    tips: [
      '⚡ Fastest way to see whether an idea reads in 3D',
      '🖼️ Image only — describe nothing, attach something',
      '🔁 Pin a seed to compare settings on the same mesh',
      '💡 Cheap enough to run three times and pick the best',
    ],
  },
  'rodin-hyper3d': {
    id: 'rodin-hyper3d',
    name: 'Rodin (Hyper3D)',
    description: 'Studio-grade PBR, exports FBX/OBJ/USDZ',
    supports: ['text-to-3d', 'image-to-3d'],
    tier: 'premium',
    emoji: '💎',
    baseCostUsd: 0.45,
    // HD maps onto Rodin's `quality: 'high'`, which bills above `medium`.
    hdMultiplier: 1.6,
    supportsTexture: true,
    supportsPbr: true,
    // Rodin is the only one here whose endpoint takes prompt and image together.
    usesPromptWithImage: true,
    exportFormats: ['glb', 'usdz', 'fbx', 'obj', 'stl'],
    typicalDuration: '2-5 min',
    tips: [
      '💎 The one to use when the mesh is going into a real pipeline',
      '📦 Exports FBX, OBJ, USDZ and STL as well as GLB',
      '✨ PBR materials react properly to scene lighting',
      '🖼️ Works from a prompt, an image, or both together',
    ],
  },
};

export const MODEL3D_MODEL_OPTIONS = Object.values(MODEL3D_MODELS);
export type Model3dModelKey = keyof typeof MODEL3D_MODELS;

/** Texture quality, exposed on the models that accept it. */
export const TEXTURE_QUALITIES = ['none', 'standard', 'HD'] as const;
export type TextureQuality = (typeof TEXTURE_QUALITIES)[number];

/** Poly budgets, phrased by what they are for rather than by a raw number. */
export const FACE_LIMIT_PRESETS: { value: number; label: string; detail: string }[] = [
  { value: 10_000, label: 'Game-ready', detail: 'Light enough for realtime' },
  { value: 30_000, label: 'Balanced', detail: 'Default — detail without bulk' },
  { value: 100_000, label: 'High detail', detail: 'Close-up renders' },
  { value: 300_000, label: 'Maximum', detail: 'Largest file, slowest to load' },
];
