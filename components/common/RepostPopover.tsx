import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  findNodeHandle,
  UIManager,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

let _activeClose: (() => void) | null = null;

function registerActive(close: () => void) {
  if (_activeClose && _activeClose !== close) _activeClose();
  _activeClose = close;
}

function unregisterActive(close: () => void) {
  if (_activeClose === close) _activeClose = null;
}


interface RepostPopoverProps {
  visible: boolean;
  onClose: () => void;
  onRepost: () => void;
  onQuote: () => void;
  /** Whether the user has already reposted (shows "Undo Repost" instead of "Repost") */
  isReposted?: boolean;
  /** Ref to the anchor View wrapping the repost button — used for positioning */
  anchorRef?: React.RefObject<View | null>;
}

const MENU_HEIGHT = 92; // approx height of the 2 menu items
const MENU_WIDTH = 150;

const RepostPopover: React.FC<RepostPopoverProps> = ({
  visible,
  onClose,
  onRepost,
  onQuote,
  isReposted,
  anchorRef,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Register / unregister singleton
  useEffect(() => {
    if (visible) {
      registerActive(onClose);
      return () => unregisterActive(onClose);
    }
  }, [visible, onClose]);

  // Measure anchor position when visible
  useEffect(() => {
    if (!visible || !anchorRef?.current) {
      setPos(null);
      return;
    }
    const node = findNodeHandle(anchorRef.current);
    if (!node) return;
    // Small delay to let layout settle
    requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, _w, h) => {
        setPos({ x, y: y + h + 20 });
      });
    });
  }, [visible, anchorRef]);

  const handleRepost = useCallback(() => {
    onClose();
    onRepost();
  }, [onClose, onRepost]);

  const handleQuote = useCallback(() => {
    onClose();
    onQuote();
  }, [onClose, onQuote]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Full-screen click-away */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        {/* Dropdown positioned at the anchor */}
        {pos && (
          <View
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              minWidth: MENU_WIDTH,
              zIndex: 50,
            }}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <BlurView
                intensity={Platform.OS === "ios" ? 60 : 40}
                tint="dark"
                {...(Platform.OS === "android"
                  ? { experimentalBlurMethod: "dimezisBlurView" }
                  : {})}
                style={styles.blurContainer}
              >
                <View style={styles.overlay}>
                  <TouchableOpacity
                    onPress={handleRepost}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-2.5 px-4 py-3"
                  >
                    <Ionicons name={isReposted ? "close-circle-outline" : "git-compare-outline"} size={16} color={isReposted ? "#EF4444" : "#fff"} />
                    <Text className={`text-xs font-medium ${isReposted ? "text-red-400" : "text-white"}`}>
                      {isReposted ? "Undo Repost" : "Repost"}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <TouchableOpacity
                    onPress={handleQuote}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-2.5 px-4 py-3"
                  >
                    <Ionicons name="create-outline" size={16} color="#fff" />
                    <Text className="text-white text-xs font-medium">Quote</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  blurContainer: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  overlay: {
    backgroundColor: "rgba(30,30,30,0.45)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 12,
  },
});

export default RepostPopover;
