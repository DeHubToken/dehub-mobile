import { storage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
import { completeEditorRecovery, discardEditorRecovery, lastRecoveryProject, readEditorRecovery, writeEditorRecovery } from '../../libs/editor/draftRecovery';
import { DEFAULT_SETTINGS, type ProjectSnapshot } from '../../libs/editor/types';

const snapshot = (title: string): ProjectSnapshot => ({ id: 'project-one', title, clips: [], tracks: [], settings: DEFAULT_SETTINGS, updatedAt: 10 });
beforeEach(() => { storage.delete('dehub-drafts-v1'); __resetDraftCacheForTests(); });

it('recovers exact title text before the asynchronous project save runs', () => {
  writeEditorRecovery('account:alice|editor', snapshot('  unfinished\n'));
  __resetDraftCacheForTests();
  expect(lastRecoveryProject('account:alice|editor')).toBe('project-one');
  expect(readEditorRecovery('account:alice|editor', 'project-one')?.title).toBe('  unfinished\n');
  expect(readEditorRecovery('account:bob|editor', 'project-one')).toBeNull();
});

it('an older successful save cannot remove a newer recovery snapshot', () => {
  const first = snapshot('First'), latest = snapshot('Next keystroke');
  writeEditorRecovery('alice', first);
  writeEditorRecovery('alice', latest);
  completeEditorRecovery('alice', first);
  expect(readEditorRecovery('alice', first.id)).toEqual(latest);
  completeEditorRecovery('alice', latest);
  expect(readEditorRecovery('alice', first.id)).toBeNull();
  expect(lastRecoveryProject('alice')).toBe(first.id);
});

it('explicit project deletion removes its recovery without deleting another project', () => {
  writeEditorRecovery('alice', snapshot('First'));
  writeEditorRecovery('alice', { ...snapshot('Second'), id: 'project-two' });
  discardEditorRecovery('alice', 'project-one');
  expect(readEditorRecovery('alice', 'project-one')).toBeNull();
  expect(lastRecoveryProject('alice')).toBe('project-two');
});
