import { entryFor, markFor, type ComparisonFeature } from './platform-comparison';

export type ComparisonView = 'all' | 'social' | 'lacks';
const EDITOR_CATEGORIES = new Set(['Video editing', 'Design and documents', 'Charts and data', 'Presentations and exports']);

/** Match the public comparison's view boundaries without hiding unknown rivals. */
export function inComparisonView(feature: ComparisonFeature, view: ComparisonView): boolean {
  return view === 'all' || (view === 'social' ? !EDITOR_CATEGORIES.has(feature.category) : markFor(entryFor(feature, 'dehub')) !== 'yes');
}
