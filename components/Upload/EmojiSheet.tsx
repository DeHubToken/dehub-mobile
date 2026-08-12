import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import GlassModal from "../ui/GlassModal";
import { EMOJI_CATEGORIES } from "../../config/ai-styles.constants";

interface EmojiSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

const CATEGORIES = Object.keys(EMOJI_CATEGORIES);

/**
 * Emoji picker for the post composer — same four categories, same order and
 * same 8-per-row grid as dehubweb's EmojiGifPicker. Web's picker also carries a
 * GIF tab, but its onGifSelect is still a "coming soon" stub, so there is no
 * working behaviour to mirror here.
 */
export default function EmojiSheet({ visible, onClose, onSelect }: EmojiSheetProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="45%"
      blurIntensity={40}
    >
      <View className="pt-3 pb-2">
        {/* Category tabs */}
        <View className="flex-row border-b border-white/10 px-2">
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => setActiveCategory(category)}
              activeOpacity={0.7}
              className="px-3 py-2"
              style={{
                borderBottomWidth: 2,
                borderBottomColor:
                  activeCategory === category ? "#fff" : "transparent",
              }}
            >
              <Text
                className={`text-xs font-medium ${
                  activeCategory === category
                    ? "text-white"
                    : "text-theme-neutrals-400"
                }`}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Emoji grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
        >
          <View className="flex-row flex-wrap">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
              <TouchableOpacity
                key={`${emoji}-${index}`}
                onPress={() => {
                  onSelect(emoji);
                  onClose();
                }}
                activeOpacity={0.6}
                className="items-center justify-center"
                style={{ width: "12.5%", aspectRatio: 1 }}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </GlassModal>
  );
}
