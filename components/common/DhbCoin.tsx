/**
 * The gold DeHub coin, inline, in place of the "DHB" ticker text.
 *
 * The word after a number reads as noise beside the coin the rest of the app
 * already uses for the same thing, and a three-letter ticker set in a UI font
 * does not survive translation the way the mark does. React Native renders an
 * <Image> nested in <Text> inline on both platforms, so this drops straight in
 * where the word was.
 *
 * DHB only. A price quoted in someone else's token keeps its own symbol.
 */
import { Image, type ImageStyle, type StyleProp } from "react-native";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

interface DhbCoinProps {
  /** Match the surrounding font size; defaults to body text. */
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function DhbCoin({ size = 13, style }: DhbCoinProps) {
  return (
    <Image
      source={DEHUB_COIN}
      resizeMode="contain"
      accessibilityLabel="DHB"
      style={[{ width: size, height: size }, style]}
    />
  );
}

export default DhbCoin;
