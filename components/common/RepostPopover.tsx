import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  findNodeHandle,
  UIManager,
} from "react-native";
import Icon from "../ui/Icon";

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
              {/* Solid, not glass: expo-blur does not blur on Android, so the old
                  45% fill let the feed card read through the menu labels. */}
              <View style={styles.menuContainer}>
                <View style={styles.overlay}>
                  <TouchableOpacity
                    onPress={handleRepost}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-2.5 px-4 py-3"
                  >
                    <Icon name={isReposted ? "X" : "Repeat2"} size={20} color={isReposted ? "#F4F4F5" : "#fff"} />
                    <Text className={`text-[15px] font-medium ${isReposted ? "text-white/80" : "text-white"}`}>
                      {isReposted ? "Undo Repost" : "Repost"}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <TouchableOpacity
                    onPress={handleQuote}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-2.5 px-4 py-3"
                  >
                    <Icon name="Quote" size={20} color="#fff" />
                    <Text className="text-white text-[15px] font-medium">Quote</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  menuContainer: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  overlay: {
    backgroundColor: "#1D1F21",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 12,
  },
});

export default RepostPopover;
