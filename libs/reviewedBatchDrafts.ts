import { campaignVariantDraft, normalizeCampaignPlan } from './campaignPlan';
import { filmShotDraft, validFilmProject, type FilmMedia, type FilmProject } from './editor/filmProject';
import { makeReviewedBatch, type ReviewedBatchItem } from './reviewedBatch';

export function campaignReviewedBatch(brief: unknown, saved: unknown, owner: string) {
  const plan = normalizeCampaignPlan(saved);
  const items: ReviewedBatchItem[] = plan.variants.map(variant => {
    const draft = campaignVariantDraft(brief, plan, variant.id);
    if (!draft) throw new Error('creator.batchInvalid');
    return { id: variant.id, label: variant.title || variant.id, draft: { ...draft, owner: owner.toLowerCase() }, references: [] };
  });
  return makeReviewedBatch('campaign', 'campaign', plan.title, owner, items);
}

export function filmReviewedBatch(film: FilmProject, kind: 'image' | 'video', media: readonly FilmMedia[], aspect: string, projectId: string, owner: string) {
  if (!validFilmProject(film)) throw new Error('creator.batchInvalid');
  const items: ReviewedBatchItem[] = film.shots.map(shot => {
    const draft = filmShotDraft(film, shot.id, kind, media, aspect, projectId, owner);
    if (!draft) throw new Error('creator.batchInvalid');
    const selected = [...new Set([...film.referenceMediaIds, ...shot.referenceMediaIds])];
    const result = shot.resultMediaId ? media.find(item => item.id === shot.resultMediaId) : undefined;
    if (kind === 'video' && result?.kind === 'image' && !selected.includes(result.id)) selected.unshift(result.id);
    return { id: shot.id, label: shot.title || shot.id, draft, references: selected.map(id => {
      const reference = media.find(item => item.id === id && item.kind === 'image');
      if (!reference) throw new Error('creator.batchMissingReference');
      return { sourceId: reference.id, url: reference.url, label: reference.name };
    }) };
  });
  return makeReviewedBatch('film', projectId, film.title, owner, items);
}

