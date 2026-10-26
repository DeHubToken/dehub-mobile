import { mediaIds } from '../../libs/editor/project';

import { filmProjectMediaIds, filmShotDraft, removeFilmProjectMedia, validFilmProject, type FilmProject } from '../../libs/editor/filmProject';
import { generationDraft, generationDraftForOwner } from '../../libs/editor/generationDraft';
import { makeCloudProjectDocument, parseCloudProjectDocument, type CloudProjectMedia } from '../../libs/editor/cloudProjectFormat';
import { projectMediaProjection } from '../../libs/editor/projectMediaProjection';
import { cloudProjectMediaIds } from '../../libs/editor/cloudProjectSession';
import type { ProjectSnapshot } from '../../libs/editor/types';

const wallet = '0x' + '1'.repeat(40), projectId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222', resultId = '33333333-3333-4333-8333-333333333333';
const film = (): FilmProject => ({ version: 1, title: 'A journey', brief: 'A botanist visits the coast', referenceMediaIds: ['reference-local'], future: { retained: true },
  shots: [{ id: 'shot-one', title: 'Arrival', prompt: 'The botanist approaches the cliff', seconds: 5, referenceMediaIds: [], resultMediaId: 'result-local', direction: { movement: 'Slow dolly in', era: '1980s' }, futureShot: 'retained' }] });
const snapshot = (): ProjectSnapshot => ({ id: 'film-local', title: 'Film', updatedAt: 5, tracks: [], clips: [], settings: { width: 1920, height: 1080, fps: 30, background: '#000000', aspectPreset: '16:9', filmProject: film() } });
const source = (id: string): CloudProjectMedia => ({ id, kind: 'image', name: id, mimeType: 'image/png', size: 1, storagePath: `${wallet}/${id}/source.png` });
const media = [{ id: 'reference-local', kind: 'image', name: 'Botanist', url: 'blob:reference' }, { id: 'result-local', kind: 'image', name: 'Accepted frame', url: 'blob:result' }];

describe('portable film project', () => {
  it('keeps optional legacy settings compatible and rejects malformed shot plans', () => {
    expect(validFilmProject(film())).toBe(true);
    expect(validFilmProject({ ...film(), shots: Array(13).fill(film().shots[0]) })).toBe(false);
    expect(validFilmProject({ ...film(), shots: [{ ...film().shots[0], seconds: Infinity }] })).toBe(false);
    const legacy = snapshot(); delete legacy.settings.filmProject;
    expect(makeCloudProjectDocument(legacy, projectId, wallet, new Map()).snapshot.settings.filmProject).toBeUndefined();
  });
  it('uploads and remaps references and accepted results even when they have no timeline clip', () => {
    const local = snapshot(), before = JSON.stringify(local);
    expect(cloudProjectMediaIds(local)).toEqual(['reference-local', 'result-local']); expect(mediaIds(local)).toEqual(['reference-local', 'result-local']);
    const doc = makeCloudProjectDocument(local, projectId, wallet, new Map([['reference-local', source(referenceId)], ['result-local', source(resultId)]]));
    expect(doc.media).toHaveLength(2);
    expect(filmProjectMediaIds(doc.snapshot.settings.filmProject)).toEqual([referenceId, resultId]);
    expect(doc.snapshot.settings.filmProject?.future).toEqual({ retained: true });
    expect(doc.snapshot.settings.filmProject?.shots[0].futureShot).toBe('retained');
    const ids = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
    const received = projectMediaProjection(doc, wallet, 'local-copy', {}, () => ids.shift()!);
    expect(filmProjectMediaIds(received.snapshot.settings.filmProject)).toEqual(['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']);
    expect(makeCloudProjectDocument(received.snapshot, projectId, wallet, new Map(Object.entries(received.bindings)))).toEqual(doc);
    expect(JSON.stringify(local)).toBe(before);
  });
  it('rejects absent, foreign or non-image conditioning sources in cloud documents', () => {
    const doc = makeCloudProjectDocument(snapshot(), projectId, wallet, new Map([['reference-local', source(referenceId)], ['result-local', source(resultId)]]));
    expect(() => parseCloudProjectDocument({ ...doc, media: doc.media.slice(1) }, wallet)).toThrow();
    expect(() => parseCloudProjectDocument(doc, '0x' + '2'.repeat(40))).toThrow();
    expect(() => parseCloudProjectDocument({ ...doc, media: [{ ...doc.media[0], kind: 'audio' }, doc.media[1]] }, wallet)).toThrow();
  });
  it('prepares reviewed references, direction, duration and isolated shot workspaces without generation', () => {
    const image = filmShotDraft(film(), 'shot-one', 'image', media, '16:9', 'film-local', 'alice')!;
    expect(image.references).toEqual([{ url: 'blob:reference', label: 'Botanist' }]);
    expect(image.cinemaDirection).toMatchObject({ era: '1980s' });
    expect(generationDraftForOwner(image, 'bob')).toBeNull();
    expect(generationDraftForOwner(image, null)).toBeNull();
    expect(generationDraftForOwner(image, 'alice')?.references).toHaveLength(1);
    const video = filmShotDraft(film(), 'shot-one', 'video', media, '16:9', 'film-local', 'alice')!;
    expect(video.references).toHaveLength(2);
    expect(video.durationSeconds).toBe(5);
    expect(video.workspaceId).not.toBe(image.workspaceId);
    expect(filmShotDraft(film(), 'shot-one', 'image', media.map(item => ({ ...item, url: 'blob:rehydrated' })), '16:9', 'film-local', 'alice')?.draftId).toBe(image.draftId);
    expect(filmShotDraft(film(), 'shot-one', 'image', [], '16:9', 'film-local', 'alice')).toBeNull();
    expect(generationDraft({ ...image, references: [{ url: 'javascript:unsafe', label: 'Bad' }] })).toBeNull();
  });
  it('removes deleted references and results while preserving the rest of the film plan', () => {
    const original = film(); original.shots[0].referenceMediaIds = ['reference-local'];
    const clean = removeFilmProjectMedia(original, new Set(['reference-local', 'result-local']))!;
    expect(clean.referenceMediaIds).toEqual([]);
    expect(clean.shots[0].referenceMediaIds).toEqual([]);
    expect(clean.shots[0].resultMediaId).toBeUndefined();
    expect(clean.shots[0].prompt).toBe(original.shots[0].prompt);
    expect(clean.future).toEqual(original.future);
    expect(clean.shots[0].futureShot).toBe('retained');
    expect(filmProjectMediaIds(original)).toHaveLength(2);
    const project = snapshot(); project.settings.filmProject = clean;
    expect(makeCloudProjectDocument(project, projectId, wallet, new Map()).media).toEqual([]);
  });
});
