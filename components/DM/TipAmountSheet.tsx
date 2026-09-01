import { DhbCoin } from "../common/DhbCoin";
import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs";

const DEHUB_COIN = require("../../assets/web-icons/dehub-coin.png");

interface TipAmountSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  currentAmount?: number;
  minAmount?: number;
  dhbBalance?: number | null;
}

const PRESETS = [500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 1_000_000] as const;

const SELECTED_BG = "rgba(255,255,255,0.2)";
const SELECTED_BORDER = "rgba(255,255,255,0.4)";

const SHEET_HEIGHT = 420;

const formatPreset = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString()}`;
  return n.toLocaleString();
};

const TipAmountSheetComponent: React.FC<TipAmountSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  currentAmount = 0,
  minAmount = 1,
  dhbBalance,
}) => {
  const insets = useSafeAreaInsets();
  const [inputValue, setInputValue] = useState(
    currentAmount > 0 ? String(currentAmount) : "",
  );
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    currentAmount > 0 && (PRESETS as readonly number[]).includes(currentAmount) ? currentAmount : null,
  );

  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setInputValue(currentAmount > 0 ? String(currentAmount) : "");
      setSelectedPreset(
        currentAmount > 0 && (PRESETS as readonly number[]).includes(currentAmount) ? currentAmount : null,
      );
      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true),
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)(),
    );
    backdropOpacity.value = withTiming(0, { duration: 180 });
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 500) {
        runOnJS(closeSheet)();
      } else {
        translateY.value = withTiming(0, {
          duration: 200,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handlePreset = useCallback((amount: number) => {
    setSelectedPreset(amount);
    setInputValue(String(amount));
  }, []);

  const handleInputChange = useCallback((val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setInputValue(cleaned);
    setSelectedPreset(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const amount = parseFloat(inputValue);
    if (isNaN(amount) || amount < minAmount) return;
    onConfirm(amount);
    closeSheet();
  }, [inputValue, minAmount, onConfirm, closeSheet]);

  const handleRemoveTip = useCallback(() => {
    onConfirm(0);
    closeSheet();
  }, [onConfirm, closeSheet]);

  const numericValue = parseFloat(inputValue);
  const isValid = !isNaN(numericValue) && numericValue >= minAmount;
  const exceedsBalance = isValid && dhbBalance != null && numericValue > dhbBalance;
  const canConfirm = isValid && !exceedsBalance;

  if (!visible && isFullyClosed) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.5)" },
              backdropStyle,
            ]}
          >
            <Pressable style={{ flex: 1 }} onPress={closeSheet} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom },
              sheetStyle,
            ]}
          >
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />

            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.handleWrap}>
                <View style={styles.handle} />
              </Animated.View>
            </GestureDetector>

            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Icon name="Gem" size={18} color="#F4F4F5" />
                <Text style={styles.headerTitle}>Add a Tip</Text>
              </View>
              <Text style={styles.recipientText}>
                Attach DHB tokens as a tip to your message
                {minAmount > 1 ? `. Min ${Number(minAmount).toLocaleString()} DHB.` : ""}
              </Text>

              <Text style={styles.sectionLabel}>Quick amounts</Text>
              <View style={styles.presetsGrid}>
                {PRESETS.map((amount) => {
                  const isSelected = selectedPreset === amount;
                  return (
                    <TouchableOpacity
                      key={amount}
                      activeOpacity={0.7}
                      onPress={() => handlePreset(amount)}
                      style={[
                        styles.presetChip,
                        isSelected && styles.presetChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          isSelected && styles.presetTextActive,
                        ]}
                      >
                        {formatPreset(amount)}
                      </Text>
                      <Image
                        source={DEHUB_COIN}
                        style={styles.coinIcon}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Or enter amount</Text>
              <View style={styles.inputRow}>
                <Image
                  source={DEHUB_COIN}
                  style={styles.inputCoinIcon}
                  resizeMode="contain"
                />
                <TextInput
                  value={inputValue}
                  onChangeText={handleInputChange}
                  placeholder="Enter amount"
                  placeholderTextColor="#8B8D90"
                  keyboardType="number-pad"
                  style={styles.textInput}
                />
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.balanceText}>
                  Balance: {dhbBalance != null ? formatCompactNumber(Number(dhbBalance)) : "—"} <DhbCoin />
                </Text>
                {exceedsBalance && (
                  <Text style={styles.errorSmall}>Insufficient</Text>
                )}
              </View>

              <View style={styles.buttonRow}>
                {currentAmount > 0 && (
                  <TouchableOpacity
                    onPress={handleRemoveTip}
                    style={styles.removeBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeBtnText}>Remove Tip</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={!canConfirm}
                  activeOpacity={0.7}
                  style={[
                    styles.confirmBtn,
                    !canConfirm && styles.confirmBtnDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.confirmBtnText,
                      !canConfirm && styles.confirmBtnTextDisabled,
                    ]}
                  >
                    {exceedsBalance
                      ? "Insufficient DHB"
                      : isValid
                        ? `Attach ${numericValue.toLocaleString()} DHB`
                        : "Enter amount"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "#0C0C0E",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    color: "#F9FBFF",
    fontSize: 17,
    fontWeight: "700",
  },
  recipientText: {
    color: "#A6A9AC",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  sectionLabel: {
    color: "#8B8D90",
    fontSize: 12,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  presetChipActive: {
    borderColor: SELECTED_BORDER,
    backgroundColor: SELECTED_BG,
  },
  presetText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  presetTextActive: {
    color: "#FFFFFF",
  },
  coinIcon: {
    width: 16,
    height: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 8,
  },
  inputCoinIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: "#F9FBFF",
    fontSize: 15,
    padding: 0,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  balanceText: {
    color: "#A6A9AC",
    fontSize: 12,
  },
  errorSmall: {
    color: "#F4F4F5",
    fontSize: 11,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  removeBtn: {
    flex: 0.7,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#F4F4F5",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  confirmBtnText: {
    color: "#09090B",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmBtnTextDisabled: {
    color: "#6F7174",
  },
});

export default memo(TipAmountSheetComponent);
