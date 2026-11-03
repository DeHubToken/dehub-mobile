import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SmartImage from '../common/SmartImage';
import { cdnImage } from '../../libs/cdnImage';
import { articleImageSize, type ArticleLook } from '../../libs/article';

/**
 * A picture inside an article with its caption under it. The address carries
 * the picture's size when the writer's app knew it, so the page holds its
 * space before it loads and a long article never jumps while scrolling. The
 * CDN sends a copy sized for the screen, not the original.
 */
function ArticleFigure({ src, caption, look, width = 420 }: { src: string; caption: string; look: ArticleLook; width?: number }) {
  const size = articleImageSize(src);
  const clean = src.replace(/#.*$/, '');
  const text = caption.trim();
  return (
    <View style={s.figure}>
      <SmartImage
        source={{ uri: cdnImage(clean, { width }) }}
        style={[s.image, { aspectRatio: size ? size.w / size.h : 4 / 3, borderRadius: look.radius ? Math.round(look.radius * 0.75) : 0, backgroundColor: look.wash }]}
        contentFit="cover"
        priority="low"
        accessibilityLabel={text || undefined}
      />
      {text ? <Text style={[s.caption, { color: look.ink3 }]}>{text}</Text> : null}
    </View>
  );
}

export default memo(ArticleFigure);

const s = StyleSheet.create({
  figure: { marginVertical: 10 },
  image: { width: '100%' },
  caption: { marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
