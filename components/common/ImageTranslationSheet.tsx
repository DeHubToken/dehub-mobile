import SheetDismissHandle from "../ui/SheetDismissHandle";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { DeHubLoader } from "../DeHubLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ImageTranslateResponse } from "../../services/translation.service";
import { translateCopy as _translateCopy } from "../../i18n/copy";

interface Props {
  visible: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  result: ImageTranslateResponse | null;
}

const LANG_NAMES: Record<string, string> = {
  get en() { return _translateCopy("copy.ba118bf7fc9c", { defaultValue: "English" }); },
  get es() { return _translateCopy("copy.3411059cb8e0", { defaultValue: "Spanish" }); },
  get fr() { return _translateCopy("copy.7458199fe97a", { defaultValue: "French" }); },
  get de() { return _translateCopy("copy.a659b60d246d", { defaultValue: "German" }); },
  get it() { return _translateCopy("copy.fe1d9c7db376", { defaultValue: "Italian" }); },
  get pt() { return _translateCopy("copy.98b01b890687", { defaultValue: "Portuguese" }); },
  get ru() { return _translateCopy("copy.5bcc40adf6e0", { defaultValue: "Russian" }); },
  get zh() { return _translateCopy("copy.8a9779f42128", { defaultValue: "Chinese" }); },
  get ja() { return _translateCopy("copy.be4ee906d3ef", { defaultValue: "Japanese" }); },
  get ko() { return _translateCopy("copy.04656c6fe003", { defaultValue: "Korean" }); },
  get ar() { return _translateCopy("copy.bafb66f32cd7", { defaultValue: "Arabic" }); },
  get hi() { return _translateCopy("copy.63c2dc51d089", { defaultValue: "Hindi" }); },
  get nl() { return _translateCopy("copy.45f16144c18c", { defaultValue: "Dutch" }); },
  get pl() { return _translateCopy("copy.770341d6e89e", { defaultValue: "Polish" }); },
  get tr() { return _translateCopy("copy.6e7aac65db01", { defaultValue: "Turkish" }); },
  get vi() { return _translateCopy("copy.f25499e9df5c", { defaultValue: "Vietnamese" }); },
  get th() { return _translateCopy("copy.ad705ee19c04", { defaultValue: "Thai" }); },
  get id() { return _translateCopy("copy.4fe1bb67f3b9", { defaultValue: "Indonesian" }); },
  get uk() { return _translateCopy("copy.6f424303fa12", { defaultValue: "Ukrainian" }); },
  get sv() { return _translateCopy("copy.a89a9329d3d4", { defaultValue: "Swedish" }); },
  get da() { return _translateCopy("copy.fe4338ad620c", { defaultValue: "Danish" }); },
  get fi() { return _translateCopy("copy.5710b435f90a", { defaultValue: "Finnish" }); },
  get cs() { return _translateCopy("copy.8b463ea23a7e", { defaultValue: "Czech" }); },
  get el() { return _translateCopy("copy.5c74e5b8100c", { defaultValue: "Greek" }); },
  get he() { return _translateCopy("copy.33e00df2aac3", { defaultValue: "Hebrew" }); },
  get ro() { return _translateCopy("copy.096b861df653", { defaultValue: "Romanian" }); },
  get hu() { return _translateCopy("copy.58801e6907f0", { defaultValue: "Hungarian" }); },
  get bn() { return _translateCopy("copy.e7f4fe2631bb", { defaultValue: "Bengali" }); },
  get ta() { return _translateCopy("copy.135d78ac8f56", { defaultValue: "Tamil" }); },
  get te() { return _translateCopy("copy.a4504b3d0ff7", { defaultValue: "Telugu" }); },
  get mr() { return _translateCopy("copy.6bbef3a79c78", { defaultValue: "Marathi" }); },
  get gu() { return _translateCopy("copy.aa1324f5df47", { defaultValue: "Gujarati" }); },
  get pa() { return _translateCopy("copy.9e61f8c4fbca", { defaultValue: "Punjabi" }); },
  get ur() { return _translateCopy("copy.2c6ef73fc9e2", { defaultValue: "Urdu" }); },
  get fa() { return _translateCopy("copy.7428909a1062", { defaultValue: "Persian" }); },
  get ms() { return _translateCopy("copy.cd43b2d3b020", { defaultValue: "Malay" }); },
  get tl() { return _translateCopy("copy.e8a6062c5c37", { defaultValue: "Filipino" }); },
  get sw() { return _translateCopy("copy.ef13b74e5743", { defaultValue: "Swahili" }); },
};

const ImageTranslationSheet: React.FC<Props> = ({ visible, onClose, isLoading, error, result }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [showOriginal, setShowOriginal] = useState(false);

  const sourceLangName = result?.sourceLang
    ? LANG_NAMES[result.sourceLang] || result.sourceLang.toUpperCase()
    : t("settings.unknown");

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
            <SheetDismissHandle onClose={onClose} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="language-outline" size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{t("feedCard.imageTranslation")}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Ionicons name="close" size={22} color="#A6A9AC" />
              </TouchableOpacity>
            </SheetDismissHandle>

            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 12 }}>
              {/* Loading */}
              {isLoading && (
                <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                  <DeHubLoader size={56} />
                  <Text style={{ color: "#A6A9AC", fontSize: 14 }}>{t("feedCard.imageTranslating")}</Text>
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
                  <Text style={{ color: "#A6A9AC", fontSize: 14 }}>{t("feedCard.imageNoText")}</Text>
                </View>
              )}

              {/* Result */}
              {result && result.hasText && !isLoading && !error && (
                <>
                  <View style={{ flexDirection: "row" }}>
                    <View style={{ backgroundColor: "#383A3D", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: "#C2C4C7", fontSize: 12 }}>{t("feedCard.translatedFrom", { lang: sourceLangName })}</Text>
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
                      {t("feedCard.originalText")}
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
