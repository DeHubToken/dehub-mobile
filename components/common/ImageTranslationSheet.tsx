import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ImageTranslateResponse } from "../../services/translation.service";

interface Props {
  visible: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  result: ImageTranslateResponse | null;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ru: "Russian", zh: "Chinese",
  ja: "Japanese", ko: "Korean", ar: "Arabic", hi: "Hindi",
  nl: "Dutch", pl: "Polish", tr: "Turkish", vi: "Vietnamese",
  th: "Thai", id: "Indonesian", uk: "Ukrainian", sv: "Swedish",
  da: "Danish", fi: "Finnish", cs: "Czech", el: "Greek",
  he: "Hebrew", ro: "Romanian", hu: "Hungarian", bn: "Bengali",
  ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati",
  pa: "Punjabi", ur: "Urdu", fa: "Persian", ms: "Malay",
  tl: "Filipino", sw: "Swahili",
};

const ImageTranslationSheet: React.FC<Props> = ({ visible, onClose, isLoading, error, result }) => {
  const insets = useSafeAreaInsets();
  const [showOriginal, setShowOriginal] = useState(false);

  const sourceLangName = result?.sourceLang
    ? LANG_NAMES[result.sourceLang] || result.sourceLang.toUpperCase()
    : "Unknown";

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="slide"
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View
            style={{
              backgroundColor: "rgba(12,12,14,0.96)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: 500,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="language-outline" size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Image Translation</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Ionicons name="close" size={22} color="#A6A9AC" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 12 }}>
              {/* Loading */}
              {isLoading && (
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                  <ActivityIndicator size="large" color="#F4F4F5" />
                  <Text style={{ color: "#A6A9AC", fontSize: 14 }}>Extracting and translating text...</Text>
                </View>
              )}

              {/* Error */}
              {!!error && !isLoading && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="alert-circle-outline" size={24} color="#F4F4F5" />
                  </View>
                  <Text style={{ color: "#F4F4F5", fontSize: 14, textAlign: "center" }}>{error}</Text>
                </View>
              )}

              {/* No text found */}
              {result && !result.hasText && !isLoading && !error && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "#383A3D", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text-outline" size={24} color="#6F7174" />
                  </View>
                  <Text style={{ color: "#A6A9AC", fontSize: 14 }}>No text found in this image</Text>
                </View>
              )}

              {/* Result */}
              {result && result.hasText && !isLoading && !error && (
                <>
                  <View style={{ flexDirection: "row" }}>
                    <View style={{ backgroundColor: "#383A3D", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: "#C2C4C7", fontSize: 12 }}>Translated from {sourceLangName}</Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                    <Text style={{ color: "#fff", fontSize: 14, lineHeight: 22 }}>{result.translatedText}</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setShowOriginal((v) => !v)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Text style={{ color: "#A6A9AC", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Original Text
                    </Text>
                    <Ionicons name={showOriginal ? "chevron-up" : "chevron-down"} size={14} color="#A6A9AC" />
                  </TouchableOpacity>

                  {showOriginal && (
                    <View style={{ backgroundColor: "#010305", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                      <Text style={{ color: "#A6A9AC", fontSize: 14, lineHeight: 22 }}>{result.extractedText}</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

export default ImageTranslationSheet;
