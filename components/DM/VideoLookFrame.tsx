/**
 * A still frame of a post video with its look, adjust dials and vignette
 * painted on, for the edit screen. The video player itself cannot be colour
 * filtered, so the Looks and Adjust tabs show this frame instead; the server
 * bakes the same matrix into the posted video. Skia only: load it through
 * `optionalSkia`.
 */
import React from "react";
import { Canvas, ColorMatrix, Image, Rect, RadialGradient, useImage, vec } from "@shopify/react-native-skia";

export default function VideoLookFrame({ uri, width, height, matrix, vignette = 0 }: {
  uri: string;
  width: number;
  height: number;
  matrix: number[] | null;
  vignette?: number;
}) {
  const image = useImage(uri);
  if (!image) return null;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Image image={image} x={0} y={0} width={width} height={height} fit="cover">
        {matrix ? <ColorMatrix matrix={matrix} /> : null}
      </Image>
      {vignette > 0 ? (
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, height / 2)}
            r={Math.hypot(width, height) / 2}
            colors={["rgba(0,0,0,0)", `rgba(0,0,0,${(0.65 * vignette) / 100})`]}
            positions={[0.45, 1]}
          />
        </Rect>
      ) : null}
    </Canvas>
  );
}
