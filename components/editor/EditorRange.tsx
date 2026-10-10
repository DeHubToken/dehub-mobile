import React from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useEditorControlGesture } from "./EditorControlGesture";
export function EditorRange(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onLive: (v: number) => void;
  onDone: () => void;
}) {
  const gesture = useEditorControlGesture(props.onDone);
  return (
    <View className="mb-2">
      <Text className="text-theme-neutrals-300 text-xs mb-1">{props.label}</Text>
      <View onTouchCancel={() => gesture.finish()}>
      <Slider
        value={props.value}
        minimumValue={props.min}
        maximumValue={props.max}
        step={props.step}
        onSlidingStart={() => gesture.begin()}
        onValueChange={value => gesture.change(() => props.onLive(value))}
        onSlidingComplete={value => {
          gesture.change(() => props.onLive(value));
          gesture.finish();
        }}
        minimumTrackTintColor="#ffffff"
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#ffffff"
        accessibilityLabel={props.label}
        style={{ height: 32 }}
      />
      </View>
    </View>
  );
}
