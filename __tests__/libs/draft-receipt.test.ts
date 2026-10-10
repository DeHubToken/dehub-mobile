import { completeDraftReceipt } from '../../libs/draft-receipt';
import { readDraft, writeDraft, __resetDraftCacheForTests } from '../../libs/draft-cache';
import { storage } from '../../libs/storage';

beforeEach(() => {
  storage.delete('dehub-drafts-v1');
  __resetDraftCacheForTests();
});

it('consumes only submitted fields, preserving newer typing and other accounts', () => {
  const body = 'account:alice|post:new:body';
  const title = 'account:alice|post:new:title';
  const other = 'account:bob|post:new:body';
  const submitted = JSON.stringify({ value: '  unfinished\n' });
  writeDraft(body, submitted);
  writeDraft(title, JSON.stringify({ value: 'Original title' }));
  writeDraft(other, submitted);
  const receipt = { [body]: submitted, [title]: readDraft(title) };
  writeDraft(title, JSON.stringify({ value: 'A new title' }));

  expect(completeDraftReceipt(receipt)).toBe(false);
  __resetDraftCacheForTests();
  expect(readDraft(body)).toBe('');
  expect(JSON.parse(readDraft(title)).value).toBe('A new title');
  expect(readDraft(other)).toBe(submitted);
});

it('keeps an intentional empty edit written after a submission', () => {
  const key = 'account:alice|post:new:body';
  writeDraft(key, JSON.stringify({ value: '' }));
  expect(completeDraftReceipt({ [key]: JSON.stringify({ value: 'Sent text' }) })).toBe(false);
  __resetDraftCacheForTests();
  expect(JSON.parse(readDraft(key)).value).toBe('');
});

it('can finish the same confirmed upload twice without affecting later drafts', () => {
  const key = 'account:alice|post:new:body';
  const receipt = { [key]: JSON.stringify({ value: 'Submitted' }) };
  writeDraft(key, receipt[key]);
  expect(completeDraftReceipt(receipt)).toBe(true);
  expect(completeDraftReceipt(receipt)).toBe(true);
  writeDraft(key, JSON.stringify({ value: 'Next post' }));
  expect(completeDraftReceipt(receipt)).toBe(false);
  expect(JSON.parse(readDraft(key)).value).toBe('Next post');
});
