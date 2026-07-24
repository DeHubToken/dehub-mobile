import React from "react";
import { View, Text, TextInput } from "react-native";

type Props = {
  title: string;
  description: string;
  titleMax?: number;
  descriptionMax: number;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  descriptionPlaceholder?: string;
  type?: 'feed' | 'video' | 'live';
};

const BasicInfoForm: React.FC<Props> = ({
  title,
  description,
  titleMax,
  descriptionMax,
  onChangeTitle,
  onChangeDescription,
  descriptionPlaceholder,
  type,
}) => {
  return (
    <View className="mt-2">
      <View className="mb-3">
        <Text className="text-gray-400 mb-1">
          Title <Text className="text-red-500">*</Text>
        </Text>
        <TextInput
          value={title}
          onChangeText={onChangeTitle}
          placeholder="Add a title"
          placeholderTextColor="#9CA3AF"
          maxLength={titleMax}
          className="h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
        />
        <View className="mt-1 flex-row justify-end">
          <Text
            className={`text-xs ${
              title.length >= (titleMax ?? Infinity) ? "text-red-500" : "text-gray-500"
            }`}
          >
            {title.length} / {titleMax}
          </Text>
        </View>
      </View>
      <View className="mb-4">
        <Text className="text-gray-400 mb-1">
          Description {type !== 'feed' && <Text className="text-red-500">*</Text>}
        </Text>
        <TextInput
          value={description}
          onChangeText={onChangeDescription}
          placeholder={descriptionPlaceholder ?? "Describe your video"}
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={descriptionMax}
          className="min-h-[96px] px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white"
        />
        <View className="mt-1 flex-row justify-end">
          <Text
            className={`text-xs ${
              description.length >= descriptionMax ? "text-red-500" : "text-gray-500"
            }`}
          >
            {description.length} / {descriptionMax}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default BasicInfoForm;
