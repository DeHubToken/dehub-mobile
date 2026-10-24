import React from "react";
import { Image, Text, View } from "react-native";
import { useReusableElementPreview } from "../../libs/editor/useReusableElementPreview";
import type { ReusableDesignElement } from "../../libs/editor/reusableElements";
export default function ReusableElementPreview({ projectId, element }: { projectId: string; element: ReusableDesignElement }) {
  const image = useReusableElementPreview(projectId, element);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5" style={{ height: 112 }}>{image ? <Image source={{ uri: image }} resizeMode="contain" style={{ width: "100%", height: 112 }} /> : <Text className="text-xs text-white/35">{element.source.layers.length}</Text>}</View>;
}
