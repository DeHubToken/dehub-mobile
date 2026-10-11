import { generationDraft } from './generationDraft';

/** Advertise only draft kinds the installed editor can actually open. */
export function editorGenerationKinds(accepts: (kind: string) => boolean = kind => !!generationDraft({ kind, prompt: 'supported' })) {
  return ['image', 'video', 'voice', 'music', 'sfx'].filter(accepts);
}
