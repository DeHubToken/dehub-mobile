import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  StyleSheet,
  Platform,
  ActivityIndicator,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { toastError, toastSuccess } from "../../libs";
import {
  getFolders,
  getFolderItems,
  createFolder,
  addItemToFolder,
  removeItemFromFolder,
  BookmarkFolder,
} from "../../services/bookmark.service";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7;

interface AddToFolderSheetProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string;
}

interface FolderWithContainment extends BookmarkFolder {
  checked: boolean;
  updating?: boolean;
}

const AddToFolderSheetComponent: React.FC<AddToFolderSheetProps> = ({
  visible,
  onClose,
  tokenId,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const [isFullyClosed, setIsFullyClosed] = useState(!visible);

  const [folders, setFolders] = useState<FolderWithContainment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadFoldersAndContainment = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFolders();
      const allFolders = res.result || [];

      // Check containment in parallel
      const enriched: FolderWithContainment[] = await Promise.all(
        allFolders.map(async (folder) => {
          if (folder.itemCount === 0) {
            return { ...folder, checked: false };
          }
          try {
            const itemsRes = await getFolderItems(folder._id, { limit: 100 });
            const checked = itemsRes.result?.some(
              (item: any) => Number(item.tokenId) === Number(tokenId)
            ) || false;
            return { ...folder, checked };
          } catch (e) {
            return { ...folder, checked: false };
          }
        })
      );
      setFolders(enriched);
    } catch (err) {
      console.warn("[AddToFolderSheet] Error loading folders:", err);
      toastError("Failed to load bookmark folders");
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    if (visible) {
      setIsFullyClosed(false);
      setShowCreateForm(false);
      setNewFolderName("");
      setNewFolderDesc("");
      loadFoldersAndContainment();

      translateY.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(
        SHEET_MAX_HEIGHT,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        () => runOnJS(setIsFullyClosed)(true)
      );
      backdropOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [visible, loadFoldersAndContainment]);

  const closeSheet = useCallback(() => {
    translateY.value = withTiming(
      SHEET_MAX_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      () => runOnJS(onClose)()
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

  const handleToggleFolder = useCallback(
    async (folder: FolderWithContainment) => {
      if (folder.updating) return;

      const folderId = folder._id;
      const isAdding = !folder.checked;

      // Optimistic update
      setFolders((prev) =>
        prev.map((f) =>
          f._id === folderId ? { ...f, checked: isAdding, updating: true } : f
        )
      );

      try {
        if (isAdding) {
          await addItemToFolder(folderId, Number(tokenId));
          toastSuccess(`Added to ${folder.name}`);
        } else {
          await removeItemFromFolder(folderId, Number(tokenId));
          toastSuccess(`Removed from ${folder.name}`);
        }
        setFolders((prev) =>
          prev.map((f) =>
            f._id === folderId ? { ...f, updating: false } : f
          )
        );
      } catch (err) {
        console.warn("[AddToFolderSheet] Error toggling item in folder:", err);
        toastError("Failed to update folder items");
        // Revert on error
        setFolders((prev) =>
          prev.map((f) =>
            f._id === folderId ? { ...f, checked: !isAdding, updating: false } : f
          )
        );
      }
    },
    [tokenId]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await createFolder(newFolderName, newFolderDesc);
      const newFolder = res.result;

      // Add to local state and immediately add item to it
      if (newFolder) {
        toastSuccess(`Folder "${newFolder.name}" created`);
        setNewFolderName("");
        setNewFolderDesc("");
        setShowCreateForm(false);
        
        // Add item to newly created folder
        try {
          await addItemToFolder(newFolder._id, Number(tokenId));
          setFolders((prev) => [
            ...prev,
            { ...newFolder, checked: true, updating: false, itemCount: 1 },
          ]);
          toastSuccess(`Added to ${newFolder.name}`);
        } catch {
          setFolders((prev) => [
            ...prev,
            { ...newFolder, checked: false, updating: false, itemCount: 0 },
          ]);
        }
      }
    } catch (err: any) {
      console.warn("[AddToFolderSheet] createFolder error", err);
      toastError(err?.message || "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }, [newFolderName, newFolderDesc, creating, tokenId]);

  const renderFolderItem = ({ item }: { item: FolderWithContainment }) => {
    return (
      <TouchableOpacity
        onPress={() => handleToggleFolder(item)}
        style={styles.folderRow}
        activeOpacity={0.7}
      >
        <View style={styles.folderInfo}>
          <Icon name="Folder" size={20} color="#D4D4D8" />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.folderName} numberOfLines={1}>
              {item.name}
            </Text>
            {!!item.description && (
              <Text style={styles.folderDesc} numberOfLines={1}>
                {item.description}
              </Text>
            )}
          </View>
        </View>

        {item.updating ? (
          <ActivityIndicator size="small" color="#D4D4D8" />
        ) : (
          <View
            style={[
              styles.checkbox,
              item.checked && styles.checkboxChecked,
            ]}
          >
            {item.checked && <Icon name="Check" size={12} color="#1E1E1E" strokeWidth={3} />}
          </View>
        )}
      </TouchableOpacity>
    );
  };

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
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }, backdropStyle]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: SHEET_MAX_HEIGHT, paddingBottom: Math.max(insets.bottom, 16) },
            sheetStyle,
          ]}
        >
          <View style={[StyleSheet.absoluteFill, styles.overlay]} />

          <GestureDetector gesture={panGesture}>
            <Animated.View style={styles.handleWrap}>
              <View style={styles.handle} />
            </Animated.View>
          </GestureDetector>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Save to Folder</Text>
              <TouchableOpacity onPress={closeSheet}>
                <Icon name="X" size={20} color="#8B8D90" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#D4D4D8" />
                <Text style={styles.loadingText}>Loading folders…</Text>
              </View>
            ) : (
              <FlatList
                data={folders}
                keyExtractor={(item) => String(item._id)}
                renderItem={renderFolderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Icon name="FolderPlus" size={48} color="#8B8D90" />
                    <Text style={styles.emptyText}>No folders created yet</Text>
                  </View>
                }
              />
            )}

            {showCreateForm ? (
              <View style={styles.createForm}>
                <TextInput
                  placeholder="Folder Name (e.g. Cooking, Travel)"
                  placeholderTextColor="#8B8D90"
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  style={styles.input}
                  maxLength={50}
                  autoFocus
                />
                <TextInput
                  placeholder="Description (Optional)"
                  placeholderTextColor="#8B8D90"
                  value={newFolderDesc}
                  onChangeText={setNewFolderDesc}
                  style={[styles.input, { height: 60, textAlignVertical: "top" }]}
                  multiline
                  maxLength={200}
                />
                <View style={styles.formButtons}>
                  <TouchableOpacity
                    onPress={() => setShowCreateForm(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateFolder}
                    disabled={!newFolderName.trim() || creating}
                    style={[
                      styles.createSubmitBtn,
                      (!newFolderName.trim() || creating) && styles.disabledBtn,
                    ]}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#1E1E1E" />
                    ) : (
                      <Text style={styles.createSubmitBtnText}>Create & Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCreateForm(true)}
                style={styles.addFolderBtn}
                activeOpacity={0.8}
              >
                <Icon name="FolderPlus" size={20} color="#D4D4D8" />
                <Text style={styles.addFolderBtnText}>Create New Folder</Text>
              </TouchableOpacity>
            )}
          </KeyboardAvoidingView>
        </Animated.View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: "#0C0C0E",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: {
    color: "#F9FBFF",
    fontSize: 18,
    fontWeight: "700",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#8B8D90",
    fontSize: 13,
    marginTop: 10,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  folderInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  folderName: {
    color: "#F9FBFF",
    fontSize: 15,
    fontWeight: "600",
  },
  folderDesc: {
    color: "#6F7174",
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#8B8D90",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#D4D4D8",
    borderColor: "#D4D4D8",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#6F7174",
    fontSize: 14,
    marginTop: 12,
  },
  addFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
  },
  addFolderBtnText: {
    color: "#D4D4D8",
    fontSize: 14,
    fontWeight: "600",
  },
  createForm: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    color: "#F9FBFF",
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  createSubmitBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#D4D4D8",
    alignItems: "center",
    justifyContent: "center",
  },
  createSubmitBtnText: {
    color: "#1E1E1E",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.5,
  },
});

export const AddToFolderSheet = memo(AddToFolderSheetComponent);
export default AddToFolderSheet;
