export interface MotionVariant { url: string; poster: string }
export interface MotionClip {
  id: string; name: string; category: string; tags: string;
  url: string; poster: string; seconds: number; width: number; height: number;
  variants: MotionVariant[];
}
export interface MotionCatalog { captured: string; total?: number; clips: MotionClip[] }
let catalogRequest: Promise<MotionCatalog> | undefined;
let featuredRequest: Promise<MotionCatalog> | undefined;
export function loadFeaturedMotionClips(): Promise<MotionCatalog> {
  if (!featuredRequest) featuredRequest = fetch('https://dehub.io/creator-clips/featured.json').then(async response => {
    if (!response.ok) throw new Error('Motion library could not load.');
    return await response.json() as MotionCatalog;
  }).catch(error => { featuredRequest = undefined; throw error; });
  return featuredRequest;
}
export async function findMotionClip(id: string): Promise<MotionClip | undefined> {
  return (await loadFeaturedMotionClips()).clips.find(clip => clip.id === id)
    ?? (await loadMotionCatalog()).clips.find(clip => clip.id === id);
}
export function loadMotionCatalog(): Promise<MotionCatalog> {
  if (!catalogRequest) catalogRequest = fetch('https://dehub.io/creator-clips/catalog.json').then(async response => {
    if (!response.ok) throw new Error('Motion library could not load.');
    return await response.json() as MotionCatalog;
  }).catch(error => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}
export function motionModel(clip: MotionClip, workflow: 'swap' | 'motion' = 'swap') {
  return workflow === 'motion' || clip.seconds > 15 ? 'kling-3-motion' : 'kling-o3-edit';
}
export function motionAspect(clip: MotionClip) { return clip.width > clip.height ? '16:9' : '9:16'; }
export function searchMotionClips(clips: MotionClip[], query: string, category = 'All') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return clips.filter(clip => (category === 'All' || clip.category === category)
    && terms.every(term => `${clip.name} ${clip.category} ${clip.tags}`.toLocaleLowerCase().includes(term)));
}
