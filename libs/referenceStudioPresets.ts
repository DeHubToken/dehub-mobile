import type { CreatorTemplate } from './creatorTemplates';

export const REFERENCE_STUDIO_PRESETS: CreatorTemplate[] = [
  { id: 'reference-character-swap', kind: 'video', group: 'Characters', nameKey: 'creator.referenceSwapName', hintKey: 'creator.referenceSwapHint', model: 'kling-o3-edit', requiresImage: true,
    template: 'Replace the main person in @Video1 with the character in @Image1. Preserve the original motion, timing, camera movement, background, lighting and color grading. Keep the character recognizable throughout. {subject}', sample: 'Preserve the original sound and natural movement.' },
  { id: 'reference-copy-motion', kind: 'video', group: 'Characters', nameKey: 'creator.referenceMotionName', hintKey: 'creator.referenceMotionHint', model: 'kling-3-motion', requiresImage: true,
    template: 'The character in the supplied image performs the same actions and facial expressions as the reference clip. Maintain the character appearance and body proportions. {subject}', sample: 'Natural movement with consistent identity.' },
  { id: 'reference-outfit-swap', kind: 'video', group: 'Commercial', nameKey: 'creator.referenceOutfitName', hintKey: 'creator.referenceOutfitHint', model: 'kling-o3-edit', requiresImage: true,
    template: 'Change the outfit of the main person in @Video1 to the outfit shown in @Image1. Preserve their face, actions, body proportions, camera movement and environment. {subject}', sample: 'Keep fabric movement natural and the original sound.' },
  { id: 'reference-product-placement', kind: 'video', group: 'Commercial', nameKey: 'creator.referenceProductName', hintKey: 'creator.referenceProductHint', model: 'kling-o3-edit', requiresImage: true,
    template: 'Replace the featured product in @Video1 with the exact product in @Image1. Preserve its label, shape and colors. Match scene lighting and perspective, retain the original hand movements and camera. {subject}', sample: 'The product stays consistent throughout the clip.' },
  { id: 'reference-compose-images', kind: 'image', group: 'Design', nameKey: 'creator.referenceComposeName', hintKey: 'creator.referenceComposeHint', model: 'flux-3-image', requiresImage: true,
    template: 'Combine the subjects and details from the supplied images into one coherent composition. Preserve their identities and recognizable details, match perspective and lighting. {subject}', sample: 'Place the subject from image 1 in the setting from image 2.' },
];
