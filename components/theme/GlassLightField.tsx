import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';

const field = Skia.RuntimeEffect.Make(`
uniform float2 size;
uniform float3 accent;
float square(float v) { return v * v; }
float gauss(float d, float w) { return exp(-square(d / w)); }
half4 main(float2 point) {
  float scale = max(size.x / 1600.0, size.y / 1000.0);
  float2 p = (point - (size - float2(1600.0, 1000.0) * scale) * .5) / scale;
  float x = p.x, y = p.y;
  float d1 = (y - (1040.0 - .82 * x + 76.0 * sin(x / 260.0 + .2))) / 1.293;
  float d2 = (y - (100.0 + .36 * x + 140.0 * sin(x / 410.0 + .4))) / 1.063;
  float d3 = (y - (940.0 - .12 * x + 150.0 * sin(x / 430.0 + 1.9))) / 1.007;
  float sky = .16 * exp(-(square((x - 1510.0) / 900.0) + square((y + 80.0) / 730.0)));
  float floorLight = .09 * exp(-(square((x - 180.0) / 800.0) + square((y - 1120.0) / 630.0)));
  float light = sky + floorLight + .32 * gauss(d1, 78.0) + .21 * gauss(d2, 55.0) + .15 * gauss(d3, 70.0);
  float crest = .18 * gauss(d1 - 18.0, 26.0) + .10 * gauss(d2 + 16.0, 24.0);
  float3 lightColour = accent * .62 + float3(80.0, 145.0, 165.0) / 255.0 * .38;
  float3 rgb = float3(2.0, 17.0, 24.0) / 255.0 + lightColour * light + float3(130.0, 215.0, 225.0) / 255.0 * crest;
  return half4(clamp(rgb, 0.0, 1.0), 1.0);
}`);
if (!field) throw new Error('Glass light field could not be compiled');

/** Same continuous light field as the web canvas, drawn once by the GPU. */
export default function GlassLightField({ accent }: { accent: readonly number[] }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return <View style={StyleSheet.absoluteFill} onLayout={({ nativeEvent: { layout } }) => {
    setSize(current => current.width === layout.width && current.height === layout.height ? current : layout);
  }}>
    {size.width > 0 && size.height > 0 && <Canvas style={StyleSheet.absoluteFill}>
      <Fill><Shader source={field!} uniforms={{ size: [size.width, size.height], accent: accent.map(channel => channel / 255) }} /></Fill>
    </Canvas>}
  </View>;
}
