import { useDraftState } from './useDraftState';
import { creatorSettingsForEditorDraft, type CreatorStudioSettings } from '../libs/creatorStudio';
import { generationDraft, type GenerationDraft } from '../libs/editor/generationDraft';

export interface MarketingHandoff { id: string; owner: string | null; draft: GenerationDraft }

export function marketingHandoff(value: unknown, owner: string | null): MarketingHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<MarketingHandoff>;
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.id)) return null;
  const inputOwner = input.owner === null ? null : typeof input.owner === 'string' ? input.owner.toLowerCase() : undefined;
  if (inputOwner === undefined || inputOwner !== (owner?.toLowerCase() ?? null)) return null;
  const draft = generationDraft(input.draft);
  if (!draft || (draft.kind !== 'image' && draft.kind !== 'video')) return null;
  return { id: input.id, owner, draft };
}

/** A campaign uses a separate account draft, preserving the existing studio workspace. */
export function useMarketingStudioDraft(options: {
  campaign: unknown;
  owner: string | null;
  scope: string;
  studio: boolean;
  initialSettings: () => CreatorStudioSettings;
}) {
  const handoff = options.studio ? marketingHandoff(options.campaign, options.owner) : null;
  const scope = handoff ? `campaign:${handoff.id}` : options.scope;
  const prepared = handoff ? creatorSettingsForEditorDraft(handoff.draft) : null;
  const [settings, setSettings] = useDraftState<CreatorStudioSettings>(`creator:${scope}:settings`, () => prepared?.settings ?? options.initialSettings());
  const [input, setInput] = useDraftState(`assistant:${scope}:${options.studio ? settings.mode : 'chat'}:input`,
    () => handoff && settings.mode === handoff.draft.kind ? handoff.draft.prompt : '');
  return { settings, setSettings, input, setInput, handoff };
}
