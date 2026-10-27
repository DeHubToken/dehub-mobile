import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestTranslationBatch } from './translation-request.mjs';
test('budget exhaustion stops the fill after one request', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ code: 'TRANSLATION_BUDGET_EXHAUSTED' }, { status: 503 }); };
  try {
    await assert.rejects(requestTranslationBatch('https://fixture.invalid', 'fixture', ['one','two'], 'es'), /TRANSLATION_BUDGET_EXHAUSTED/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});
test('bulk work always declares its budget scope', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).purpose, 'i18n');
    return Response.json({ translatedText: 'uno' });
  };
  try { assert.deepEqual(await requestTranslationBatch('https://fixture.invalid', 'fixture', ['one'], 'es'), { translatedText: 'uno' }); }
  finally { globalThis.fetch = original; }
});
