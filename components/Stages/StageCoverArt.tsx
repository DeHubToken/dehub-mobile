import { translateCopy as _translateCopy } from '../../i18n/copy';
/**
 * StageCoverArt — a stage's graphic, whole, at one ratio everywhere
 * =================================================================
 * A port of web's component of the same name, and the same two rules:
 *
 * 1. **16:9, always.** A ratio rather than a height, so it holds identically on
 *    a phone and a tablet. A height letterboxes a wide card into a strip and
 *    swallows a narrow one.
 * 2. **`contain`, never `cover`.** Filling the box means cutting whatever does
 *    not fit, which silently ate the top and bottom of any cover that was not
 *    already 16:9. Containing it means a host always sees the graphic they
 *    uploaded — a non-16:9 cover is bordered, not cropped.
 *
 * Mobile used to do neither: the cover was a cropped `cover` fill *behind* the
 * card's text under a black gradient, so the artwork was both cut and dimmed,
 * and an ended stage showed no artwork at all. The black bed here is what those
 * borders show, and is also why the art no longer sits behind the text — a
 * contained image has empty space in it, and text over that reads as a mistake.
 *
 * A stage with no cover gets its generated poster (GeneratedStageCover) when
 * the caller passes `stage`.
 *
 * @module components/Stages/StageCoverArt
 */

import React from "react";
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { storageImageSource } from "../../libs/cdnImage";
import type { StageCoverSource } from "../../libs/stage-cover";
import GeneratedStageCover from "./GeneratedStageCover";

export interface StageCoverArtProps {
  uri?: string | null;
  /** Used for the screen-reader label; a cover with no title is decorative. */
  title?: string | null;
  /** The stage itself; with no `uri` its generated poster is drawn instead. */
  stage?: StageCoverSource;
  style?: StyleProp<ViewStyle>;
}

const StageCoverArt: React.FC<StageCoverArtProps> = ({ uri, title, stage, style }) => {
  if (!uri) return stage ? <GeneratedStageCover stage={stage} style={style} /> : null;
  return (
  <View style={[styles.frame, style]}>
    <Image
      // Every placement is a full-width card, so the window bounds the frame.
      source={storageImageSource(uri, Dimensions.get("window").width)}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      transition={180}
      accessible={!!title}
      accessibilityLabel={title ? _translateCopy("copy.99ca327a47b5", { defaultValue: "Cover graphic for {{value1}}", value1: title }) : undefined}
    />
  </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
  },
});

export default React.memo(StageCoverArt);
