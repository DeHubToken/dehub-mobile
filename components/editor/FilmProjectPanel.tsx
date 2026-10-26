import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DesignDraftInput as TextInput } from './DesignDraftInput';
import { CinemaDirectionControls } from '../Assistant/CinemaDirectionControls';
import { listMedia, mediaFileUri } from '../../libs/editor/storage';
import { newId } from '../../libs/editor/project';
import { filmShotDraft, validFilmProject, type FilmMedia, type FilmProject, type FilmShot } from '../../libs/editor/filmProject';
import type { GenerationDraft } from '../../libs/editor/generationDraft';
import type { ProjectSnapshot } from '../../libs/editor/types';

export default function FilmProjectPanel({ project, current, commit, onGenerate }: {
  project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void;
  onGenerate?: (draft: GenerationDraft) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [media, setMedia] = useState<FilmMedia[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [issue, setIssue] = useState(false);
  const refresh = async () => { const values = await listMedia(); setMedia(values.map(value => ({ id: value.id, name: value.name, kind: value.kind, url: mediaFileUri(value) }))); };
  useEffect(() => { let active = true; listMedia().then(values => { if (active) setMedia(values.map(value => ({ id: value.id, name: value.name, kind: value.kind, url: mediaFileUri(value) }))); }).catch(() => { if (active) setIssue(true); }); return () => { active = false; }; }, [project.id]);
  const film = validFilmProject(project.settings.filmProject) ? project.settings.filmProject : undefined;
  const update = (next: FilmProject) => {
    const latest = current(); if (!latest || latest.id !== project.id) return;
    commit({ ...latest, settings: { ...latest.settings, filmProject: next } }); setIssue(false);
  };
  const action = (label: string, press: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press} className="rounded-xl border border-theme-neutrals-700 px-3 py-3" style={{ opacity: disabled ? 0.4 : 1 }}><Text className="text-xs text-theme-neutrals-100">{label}</Text></Pressable>;
  if (!film) return <View className="p-3"><Text className="font-semibold text-theme-neutrals-100">{t('editor.film.title')}</Text><Text className="my-2 text-xs text-theme-neutrals-400">{t('editor.film.intro')}</Text>{action(t('editor.film.create'), () => update({ version: 1, title: '', brief: '', referenceMediaIds: [], shots: [] }))}</View>;
  const shot = film.shots.find(value => value.id === selected) ?? film.shots[0];
  const changeShot = (patch: Partial<FilmShot>) => update({ ...film, shots: film.shots.map(value => value.id === shot?.id ? { ...value, ...patch } : value) });
  const field = (label: string, value: string, change: (text: string) => void, limit: number, multiline = false) => <View className="mt-3"><Text className="mb-1 text-xs text-theme-neutrals-300">{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} maxLength={limit} multiline={multiline} className="min-h-[44px] rounded-xl border border-theme-neutrals-700 p-2 text-sm text-theme-neutrals-100" /></View>;
  const choices = (label: string, ids: string[], change: (ids: string[]) => void, result = false) => <View className="mt-3">
    <Text className="mb-2 text-xs text-theme-neutrals-300">{label}</Text>
    <ScrollView nestedScrollEnabled style={{ maxHeight: 140 }}>
      {result && action(t('editor.film.noResult'), () => change([]))}
      {media.filter(item => (item.kind === 'image' || result && item.kind === 'video') && item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 50).map(item => <Pressable key={item.id} accessibilityRole={result ? 'radio' : 'checkbox'} accessibilityState={{ checked: ids.includes(item.id) }} onPress={() => {
        const next = result ? [item.id] : ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]; if (next.length <= 4) change(next);
      }} className="border-b border-theme-neutrals-700 py-3"><Text className="text-xs text-theme-neutrals-100">{ids.includes(item.id) ? '✓ ' : ''}{item.name}</Text></Pressable>)}
    </ScrollView>
  </View>;
  const prepare = async (kind: 'image' | 'video') => {
    if (!shot || !onGenerate || preparing) return;
    const latest = current(); if (!latest || latest.id !== project.id) return;
    const draft = filmShotDraft(film, shot.id, kind, media, project.settings.aspectPreset, project.id);
    if (!draft) { setIssue(true); return; }
    setPreparing(true);
    try { await onGenerate(draft); } catch { setIssue(true); } finally { setPreparing(false); }
  };
  return <View className="p-3">
    <Text className="font-semibold text-theme-neutrals-100">{t('editor.film.title')}</Text>
    <Text className="mt-2 text-xs text-theme-neutrals-400">{t('editor.film.intro')}</Text>
    {field(t('editor.film.name'), film.title, title => update({ ...film, title }), 200)}
    {field(t('editor.film.brief'), film.brief, brief => update({ ...film, brief }), 3000, true)}
    {field(t('editor.film.searchMedia'), query, setQuery, 100)}
    <View className="mt-3">{action(t('editor.film.refreshMedia'), () => { void refresh().catch(() => setIssue(true)); })}</View>
    {choices(t('editor.film.sharedReferences'), film.referenceMediaIds, ids => update({ ...film, referenceMediaIds: ids }))}
    <View className="mt-3 flex-row flex-wrap gap-2">
      {film.shots.map((item, index) => <View key={item.id}>{action(`${index + 1}. ${item.title || t('editor.film.shot')}`, () => setSelected(item.id))}</View>)}
      {action(t('editor.film.addShot'), () => { const id = newId(12); update({ ...film, shots: [...film.shots, { id, title: '', prompt: '', seconds: 5, referenceMediaIds: [] }] }); setSelected(id); }, film.shots.length >= 12)}
    </View>
    {shot && <View className="mt-4 rounded-xl border border-theme-neutrals-700 p-3">
      {field(t('editor.film.shotName'), shot.title, title => changeShot({ title }), 200)}
      {field(t('editor.film.action'), shot.prompt, prompt => changeShot({ prompt }), 2000, true)}
      {field(t('editor.film.seconds'), String(shot.seconds), text => { const seconds = Number(text); if (seconds >= 1 && seconds <= 30) changeShot({ seconds }); }, 4)}
      {choices(t('editor.film.shotReferences'), shot.referenceMediaIds, ids => changeShot({ referenceMediaIds: ids }))}
      <CinemaDirectionControls value={shot.direction ?? {}} onChange={direction => changeShot({ direction })} mode="video" />
      <View className="mt-3 flex-row flex-wrap gap-2">{action(t('editor.film.frame'), () => { void prepare('image'); }, preparing || !shot.prompt.trim() || !onGenerate)}{action(t('editor.film.video'), () => { void prepare('video'); }, preparing || !shot.prompt.trim() || !onGenerate)}</View>
      <Text className="mt-2 text-xs text-theme-neutrals-400">{t('editor.film.review')}</Text>
      {choices(t('editor.film.result'), shot.resultMediaId ? [shot.resultMediaId] : [], ids => changeShot({ resultMediaId: ids[0] }), true)}
      {media.find(item => item.id === shot.resultMediaId)?.kind === 'image' && <Image accessibilityLabel={t('editor.film.result')} source={{ uri: media.find(item => item.id === shot.resultMediaId)!.url }} resizeMode="contain" style={{ width: '100%', height: 140, marginTop: 12 }} />}
      <Text className="mt-2 text-xs text-theme-neutrals-400">{t('editor.film.resultHint')}</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">{[-1, 1].map(offset => <View key={offset}>{action(t(offset < 0 ? 'editor.film.earlier' : 'editor.film.later'), () => {
        const shots = [...film.shots], index = shots.indexOf(shot); [shots[index], shots[index + offset]] = [shots[index + offset], shots[index]]; update({ ...film, shots });
      }, film.shots.indexOf(shot) + offset < 0 || film.shots.indexOf(shot) + offset >= film.shots.length)}</View>)}{action(t('editor.film.remove'), () => update({ ...film, shots: film.shots.filter(item => item.id !== shot.id) }))}</View>
    </View>}
    {issue && <Text accessibilityRole="alert" className="mt-3 text-xs text-theme-neutrals-100">{t('editor.film.issue')}</Text>}
  </View>;
}
