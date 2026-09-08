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
          <Icon name="Folder" size={20} color="#FACC15" />
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

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoider}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              { height: SHEET_MAX_HEIGHT, paddingBottom: Math.max(insets.bottom, 16) },
              sheetStyle,
            ]}
          >
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />

            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.handleWrap}>
                <View style={styles.handle} />
              </Animated.View>
            </GestureDetector>

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Save to folder</Text>
                <Text style={styles.subtitle}>Choose where you want to keep this post.</Text>
              </View>
              <TouchableOpacity
                onPress={closeSheet}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close folder picker"
              >
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
                style={styles.folderList}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                      <Icon name="FolderPlus" size={28} color="#FACC15" />
                    </View>
                    <Text style={styles.emptyText}>No folders created yet</Text>
                    <Text style={styles.emptyHint}>Create one to organize this post.</Text>
                  </View>
                }
              />
            )}

            <View style={styles.footer}>
              {showCreateForm ? (
                <View style={styles.createForm}>
                  <Text style={styles.fieldLabel}>Folder name</Text>
                  <TextInput
                    placeholder="e.g. Cooking, Travel"
                    placeholderTextColor="#6F7174"
                    value={newFolderName}
                    onChangeText={setNewFolderName}
                    style={styles.input}
                    maxLength={50}
                    autoFocus
                    returnKeyType="next"
                  />
                  <Text style={styles.fieldLabel}>Description <Text style={styles.optionalLabel}>(optional)</Text></Text>
                  <TextInput
                    placeholder="What belongs in this folder?"
                    placeholderTextColor="#6F7174"
                    value={newFolderDesc}
                    onChangeText={setNewFolderDesc}
                    style={[styles.input, styles.descriptionInput]}
                    multiline
                    maxLength={200}
                    returnKeyType="done"
                  />
                  <View style={styles.formButtons}>
                    <TouchableOpacity
                      onPress={() => setShowCreateForm(false)}
                      style={styles.cancelBtn}
                      accessibilityRole="button"
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
                      accessibilityRole="button"
                    >
                      {creating ? (
                        <ActivityIndicator size="small" color="#18181B" />
                      ) : (
                        <Text style={styles.createSubmitBtnText}>Create & save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowCreateForm(true)}
                  style={styles.addFolderBtn}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Icon name="FolderPlus" size={20} color="#18181B" />
                  <Text style={styles.addFolderBtnText}>Create new folder</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerCopy: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    color: "#F9FBFF",
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8B8D90",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
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
    paddingVertical: 12,
    flexGrow: 1,
  },
  folderList: {
    flex: 1,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
    backgroundColor: "#FACC15",
    borderColor: "#FACC15",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250,204,21,0.1)",
  },
  emptyText: {
    color: "#F9FBFF",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 12,
  },
  emptyHint: {
    color: "#6F7174",
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  addFolderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FACC15",
    borderRadius: 14,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  addFolderBtnText: {
    color: "#18181B",
    fontSize: 14,
    fontWeight: "700",
  },
  createForm: {
    gap: 7,
  },
  fieldLabel: {
    color: "#D4D4D8",
    fontSize: 12,
    fontWeight: "600",
  },
  optionalLabel: {
    color: "#6F7174",
    fontWeight: "400",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    color: "#F9FBFF",
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
  },
  descriptionInput: {
    height: 56,
    paddingTop: 12,
    textAlignVertical: "top",
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
    backgroundColor: "#FACC15",
    alignItems: "center",
    justifyContent: "center",
  },
  createSubmitBtnText: {
    color: "#18181B",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.5,
  },
});

export const AddToFolderSheet = memo(AddToFolderSheetComponent);
export default AddToFolderSheet;
