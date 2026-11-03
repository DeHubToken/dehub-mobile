import { translateCopy as _translateCopy } from '../../i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import SmartImage from '../common/SmartImage';
import MarkdownText from '../ui/MarkdownText';
import Icon, { type IconName } from '../ui/Icon';
import ArticleFigure from './ArticleFigure';
import {
  ARTICLE_BODY_MAX, ARTICLE_BODY_MIN, ARTICLE_CAPTION_MAX, ARTICLE_IMAGE_MAX, ARTICLE_RAW_MAX, articleImages, articleReadingMinutes,
  articleSummaryFromBody, articleTextLength, articleWordCount, removeArticleImage, setArticleImageCaption, type ArticleLook,
} from '../../libs/article';

interface ArticleEditorProps {
  look: ArticleLook;
  title: string;
  onTitleChange: (v: string) => void;
  titleMax: number;
  body: string;
  onBodyChange: (v: string) => void;
  selection: { start: number; end: number };
  onSelectionChange: (sel: { start: number; end: number }) => void;
  onFormat: (before: string, after: string, placeholder: string, block: boolean) => void;
  preview: boolean;
  onTogglePreview: () => void;
  summary: string;
  onSummaryChange: (v: string) => void;
  summaryMax: number;
  coverUri: string | null;
  onPickCover: () => void;
  onRemoveCover: () => void;
  /** Opens the photo picker for pictures inside the article. */
  onAddImages: () => void;
  /** Pictures still uploading. */
  uploadingImages: number;
}

type Tool = { key: string; icon?: IconName; glyph?: string; before: string; after: string; placeholder: string; block: boolean };
const TOOLS: Tool[] = [
  { key: 'heading', glyph: 'H1', before: '# ', after: '', get placeholder() { return _translateCopy("copy.b34f17f02ecf", { defaultValue: "Heading" }); }, block: true },
  { key: 'subheading', glyph: 'H2', before: '## ', after: '', get placeholder() { return _translateCopy("copy.f593a11d4a56", { defaultValue: "Subheading" }); }, block: true },
  { key: 'bold', icon: 'Bold', before: '**', after: '**', get placeholder() { return _translateCopy("copy.fae745ccad9a", { defaultValue: "bold text" }); }, block: false },
  { key: 'italic', icon: 'Italic', before: '*', after: '*', get placeholder() { return _translateCopy("copy.5ca0a3629fd9", { defaultValue: "italic text" }); }, block: false },
  { key: 'quote', icon: 'Quote', before: '> ', after: '', get placeholder() { return _translateCopy("copy.eb4cdebd82bf", { defaultValue: "Quote" }); }, block: true },
  { key: 'bullets', glyph: '•', before: '- ', after: '', get placeholder() { return _translateCopy("copy.201333ac71bc", { defaultValue: "List item" }); }, block: true },
  { key: 'numbers', glyph: '1.', before: '1. ', after: '', get placeholder() { return _translateCopy("copy.201333ac71bc", { defaultValue: "List item" }); }, block: true },
  { key: 'link', icon: 'Link', before: '[', after: '](https://)', get placeholder() { return _translateCopy("copy.9ccec3cf40d4", { defaultValue: "link text" }); }, block: false },
];

/**
 * The article writer, laid out like web's: cover first (it is also the share
 * card), a big title, a real format bar and the body. The summary and the
 * share preview come after the article, prefilled from its first paragraph.
 */
export default function ArticleEditor(p: ArticleEditorProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { look } = p;
  const words = articleWordCount(p.body);
  const minutes = articleReadingMinutes(p.body);
  const textLength = articleTextLength(p.body);
  const remaining = ARTICLE_BODY_MIN - textLength;
  const images = articleImages(p.body);
  const full = images.length + p.uploadingImages >= ARTICLE_IMAGE_MAX;
  const pill = { borderRadius: look.radius ? 999 : 0 };
  const renderImage = React.useCallback((src: string, caption: string, key: string) => <ArticleFigure key={key} src={src} caption={caption} look={look} />, [look]);

  return (
    <View style={{ gap: 14 }}>
      {p.coverUri ? (
        <View style={[s.cover, { borderRadius: look.radius }]}>
          <SmartImage source={{ uri: p.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={s.coverBar}>
            <Pressable accessibilityRole="button" onPress={p.onPickCover} style={[s.darkPill, pill]}>
              <Icon name="ImagePlus" size={14} color="#fff" />
              <Text style={s.darkPillText}>{t('articles.changeCover')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('articles.removeCover')} onPress={p.onRemoveCover} style={[s.darkPill, pill, { paddingHorizontal: 8 }]}>
              <Icon name="X" size={14} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={p.onPickCover} style={[s.drop, { borderRadius: look.radius, borderColor: look.line }]}>
          <Icon name="ImagePlus" size={26} color={look.accent} />
          <Text style={{ color: look.ink2, fontWeight: '600' }}>{t('articles.addCover')}</Text>
          <Text style={{ color: look.ink3, fontSize: 12, textAlign: 'center' }}>{t('articles.coverHint')}</Text>
        </Pressable>
      )}

      <TextInput
        value={p.title}
        onChangeText={v => p.onTitleChange(v.replace(/\n/g, ' '))}
        placeholder={t('articles.titlePlaceholder')}
        placeholderTextColor={look.ink3}
        maxLength={p.titleMax}
        multiline
        scrollEnabled={false}
        accessibilityLabel={t('articles.titleLabel')}
        style={[s.title, { color: look.ink, fontFamily: look.font }, look.mono && { textTransform: 'uppercase' }]}
      />

      <View style={[s.toolbar, pill, { borderColor: look.line, backgroundColor: look.wash }]}>
        {TOOLS.map(tool => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            accessibilityLabel={t(`articles.format.${tool.key}`)}
            onPress={() => p.onFormat(tool.before, tool.after, tool.placeholder, tool.block)}
            style={s.tool}
            hitSlop={4}
          >
            {tool.icon ? <Icon name={tool.icon} size={16} color={look.ink2} /> : <Text style={[s.glyph, { color: look.ink2 }]}>{tool.glyph}</Text>}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('articles.format.image', { defaultValue: 'Add images' })}
          accessibilityState={{ disabled: full }}
          disabled={full}
          onPress={p.onAddImages}
          style={[s.tool, full && { opacity: 0.4 }]}
          hitSlop={4}
        >
          {p.uploadingImages > 0 ? <ActivityIndicator size="small" color={look.ink2} /> : <Icon name="ImagePlus" size={16} color={look.ink2} />}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={p.onTogglePreview} style={[s.tool, { marginLeft: 'auto' }]} accessibilityLabel={p.preview ? t('articles.edit') : t('articles.preview')}>
          <Icon name={p.preview ? 'Pencil' : 'Eye'} size={16} color={p.preview ? look.accent : look.ink2} />
        </Pressable>
      </View>

      {p.preview ? (
        <View style={{ minHeight: 240 }}>
          <MarkdownText content={p.body || t('articles.previewEmpty')} color={look.ink2} accent={look.accent} renderImage={renderImage} style={{ fontSize: look.mono ? 15 : 17, lineHeight: 28, fontFamily: look.font }} />
        </View>
      ) : (
        <TextInput
          value={p.body}
          onChangeText={p.onBodyChange}
          maxLength={ARTICLE_RAW_MAX}
          multiline
          scrollEnabled={false}
          selection={p.selection}
          onSelectionChange={e => p.onSelectionChange(e.nativeEvent.selection)}
          placeholder={t('articles.bodyPlaceholder')}
          placeholderTextColor={look.ink3}
          accessibilityLabel={t('articles.body')}
          style={[s.body, { color: look.ink2, fontFamily: look.font }]}
        />
      )}
      {!p.preview && images.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[s.label, { color: look.accent }]}>
            {t('articles.imagesCount', { count: images.length, max: ARTICLE_IMAGE_MAX, defaultValue: 'Images · {{count}}/{{max}}' })}
          </Text>
          {images.map(img => (
            <View key={img.index} style={[s.captionRow, { borderColor: look.line, backgroundColor: look.wash, borderRadius: look.radius ? 12 : 0 }]}>
              <SmartImage source={{ uri: img.url.replace(/#.*$/, '') }} style={[s.thumb, { borderRadius: look.radius ? 10 : 0 }]} contentFit="cover" />
              <TextInput
                value={img.caption}
                onChangeText={v => p.onBodyChange(setArticleImageCaption(p.body, img.index, v))}
                maxLength={ARTICLE_CAPTION_MAX}
                placeholder={t('articles.captionPlaceholder', { defaultValue: 'Add a caption' })}
                placeholderTextColor={look.ink3}
                accessibilityLabel={t('articles.captionLabel', { n: img.index + 1, defaultValue: 'Caption for image {{n}}' })}
                returnKeyType="done"
                style={[s.captionInput, { color: look.ink }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('articles.removeInlineImage', { n: img.index + 1, defaultValue: 'Remove image {{n}}' })}
                onPress={() => p.onBodyChange(removeArticleImage(p.body, img.index))}
                style={s.tool}
                hitSlop={4}
              >
                <Icon name="X" size={16} color={look.ink2} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Text style={[s.count, { color: look.ink3 }]}>
        {p.uploadingImages > 0
          ? t('articles.imagesUploading', { count: p.uploadingImages, defaultValue: 'Adding images ({{count}})…' })
          : remaining > 0
            ? t('articles.needBody', { count: remaining })
            : textLength > ARTICLE_BODY_MAX
              ? t('articles.bodyTooLong', { count: textLength - ARTICLE_BODY_MAX, defaultValue: '{{count}} characters over the limit' })
              : `${t('articles.wordCount', { count: words })} · ${t('articles.minRead', { count: minutes })}`}
      </Text>

      <View style={[s.sep, { backgroundColor: look.line }]} />

      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: look.accent }]}>{t('articles.summaryLabel')}</Text>
        <TextInput
          value={p.summary}
          onChangeText={p.onSummaryChange}
          onFocus={() => { if (!p.summary.trim() && p.body.trim()) p.onSummaryChange(articleSummaryFromBody(p.body)); }}
          maxLength={p.summaryMax}
          multiline
          scrollEnabled={false}
          placeholder={t('articles.summaryPlaceholder')}
          placeholderTextColor={look.ink3}
          style={[s.summary, { color: look.ink, borderColor: look.line, borderRadius: look.radius ? 12 : 0 }]}
        />
        <Text style={[s.count, { color: look.ink3 }]}>{p.summary.length}/{p.summaryMax}</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: look.accent }]}>{t('articles.sharePreview')}</Text>
        <View style={[s.share, { borderColor: look.line, borderRadius: look.radius }]}>
          {p.coverUri
            ? <SmartImage source={{ uri: p.coverUri }} style={{ width: '100%', aspectRatio: 1.91 }} contentFit="cover" />
            : <View style={[s.noCover, { backgroundColor: look.wash }]}><Text style={{ color: look.ink3, fontSize: 12, textAlign: 'center' }}>{t('articles.noCoverShare')}</Text></View>}
          <View style={{ padding: 12, gap: 3 }}>
            <Text style={{ color: look.ink, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{p.title.trim() || t('articles.titlePlaceholder')}</Text>
            <Text style={{ color: look.ink3, fontSize: 12 }} numberOfLines={2}>{p.summary.trim() || t('articles.summaryPlaceholder')}</Text>
            <Text style={{ color: look.ink3, fontSize: 11 }}>{_copy("copy.bf640b85d499", { defaultValue: "dehub.io · " })}{t('articles.minRead', { count: minutes })}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 1.91, overflow: 'hidden', backgroundColor: '#111' },
  coverBar: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  darkPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  darkPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  drop: { aspectRatio: 3, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 16 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', padding: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2 },
  tool: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 13, fontWeight: '800' },
  body: { fontSize: 17, lineHeight: 28, minHeight: 240, textAlignVertical: 'top', padding: 0 },
  count: { fontSize: 12, textAlign: 'right' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderWidth: 1 },
  thumb: { width: 56, height: 56 },
  captionInput: { flex: 1, fontSize: 15, paddingVertical: 6 },
  sep: { height: StyleSheet.hairlineWidth },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  summary: { borderWidth: 1, padding: 12, fontSize: 15, lineHeight: 22, minHeight: 90, textAlignVertical: 'top' },
  share: { borderWidth: 1, overflow: 'hidden' },
  noCover: { aspectRatio: 1.91, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
