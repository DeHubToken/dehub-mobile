import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import ScreenHeader from "../components/ScreenHeader";
import PostsInfiniteList from "../components/Profile/PostsInfiniteList";
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import Icon from "../components/ui/Icon";
import { toastError, toastSuccess } from "../libs";
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  BookmarkFolder,
} from "../services/bookmark.service";

type ActiveTab = "all" | "folders";

const SavedPostsScreen: React.FC = () => {
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [selectedFolder, setSelectedFolder] = useState<BookmarkFolder | null>(null);

  // Folders list state
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Folder CRUD Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<BookmarkFolder | null>(null);

  // Text inputs
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Menu action state
  const [activeMenuFolder, setActiveMenuFolder] = useState<BookmarkFolder | null>(null);
  const [showMenuModal, setShowMenuModal] = useState(false);

  const fetchFoldersList = useCallback(async (silent = false) => {
    if (!silent) setLoadingFolders(true);
    try {
      const res = await getFolders();
      setFolders(res.result || []);
    } catch (err) {
      console.warn("[SavedPostsScreen] Error fetching folders:", err);
      toastError("Failed to fetch folders");
    } finally {
      if (!silent) setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "folders" && !selectedFolder) {
      fetchFoldersList();
    }
  }, [activeTab, selectedFolder, fetchFoldersList]);

  const handleCreateFolder = async () => {
    if (!folderName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await createFolder(folderName, folderDesc);
      if (res.status) {
        toastSuccess(`Folder "${res.result.name}" created`);
        setFolderName("");
        setFolderDesc("");
        setShowCreateModal(false);
        fetchFoldersList(true);
      }
    } catch (err: any) {
      console.warn("[SavedPostsScreen] Error creating folder:", err);
      toastError(err?.message || "Failed to create folder");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditFolder = async () => {
    if (!folderToEdit || !folderName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await updateFolder(folderToEdit._id, {
        name: folderName.trim(),
        description: folderDesc,
      });
      if (res.status) {
        toastSuccess("Folder updated");
        setFolderToEdit(null);
        setFolderName("");
        setFolderDesc("");
        setShowEditModal(false);
        fetchFoldersList(true);
      }
    } catch (err: any) {
      console.warn("[SavedPostsScreen] Error updating folder:", err);
      toastError(err?.message || "Failed to update folder");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFolder = (folder: BookmarkFolder) => {
    Alert.alert(
      "Delete Folder",
      `Are you sure you want to delete "${folder.name}"? The saved posts inside will not be deleted from your Saved list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await deleteFolder(folder._id);
              if (res.status) {
                toastSuccess("Folder deleted");
                fetchFoldersList(true);
              }
            } catch (err) {
              console.warn("[SavedPostsScreen] Error deleting folder:", err);
              toastError("Failed to delete folder");
            }
          },
        },
      ]
    );
  };

  const openEditModal = (folder: BookmarkFolder) => {
    setFolderToEdit(folder);
    setFolderName(folder.name);
    setFolderDesc(folder.description || "");
    setShowEditModal(true);
  };

  const renderFolderCard = ({ item }: { item: BookmarkFolder }) => {
    return (
      <TouchableOpacity
        onPress={() => setSelectedFolder(item)}
        style={styles.folderCard}
        activeOpacity={0.7}
      >
        <View style={styles.folderCardContent}>
          <View style={styles.folderHeader}>
            <View style={styles.folderIconContainer}>
              <Icon name="Folder" size={32} color="#FACC15" />
            </View>
            <TouchableOpacity
              onPress={() => {
                setActiveMenuFolder(item);
                setShowMenuModal(true);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="MoreVertical" size={20} color="#8B8D90" />
            </TouchableOpacity>
          </View>
          <Text style={styles.folderName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.folderCount} numberOfLines={1}>
            {item.itemCount} {item.itemCount === 1 ? "post" : "posts"}
          </Text>
          {!!item.description && (
            <Text style={styles.folderDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // If a folder is clicked, render Folder detail screen
  if (selectedFolder) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        <ScreenHeader
          title={selectedFolder.name}
          subtitle={selectedFolder.description || "Bookmark collection"}
          canGoBack
          onBackPress={() => {
            setSelectedFolder(null);
            fetchFoldersList(); // Refresh list to get new counts
          }}
          rightContent={
            <TouchableOpacity
              onPress={() => {
                setActiveMenuFolder(selectedFolder);
                setShowMenuModal(true);
              }}
            >
              <Icon name="MoreVertical" size={22} color="#E5E7EB" />
            </TouchableOpacity>
          }
        />
        <PostsInfiniteList
          variant="folder"
          folderId={selectedFolder._id}
          bottomPadding={80}
        />

        {/* Options Modal for currently selected folder inside detail view */}
        <Modal
          visible={showMenuModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenuModal(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowMenuModal(false)}
          >
            <View style={styles.menuContainer}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {activeMenuFolder?.name}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setShowMenuModal(false);
                  if (activeMenuFolder) openEditModal(activeMenuFolder);
                }}
                style={styles.menuItem}
              >
                <Icon name="Edit" size={18} color="#F9FBFF" />
                <Text style={styles.menuItemText}>Edit Collection Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowMenuModal(false);
                  if (activeMenuFolder) {
                    handleDeleteFolder(activeMenuFolder);
                    // If we delete the currently opened folder, go back to folder list
                    setSelectedFolder(null);
                  }
                }}
                style={[styles.menuItem, { borderBottomWidth: 0 }]}
              >
                <Icon name="Trash2" size={18} color="#EF4444" />
                <Text style={[styles.menuItemText, { color: "#EF4444" }]}>Delete Collection</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowMenuModal(false)}
                style={styles.menuCancelBtn}
              >
                <Text style={styles.menuCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* Edit Folder Details Modal */}
        <Modal
          visible={showEditModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowEditModal(false);
            setFolderName("");
            setFolderDesc("");
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Collection</Text>
              <TextInput
                placeholder="Name"
                placeholderTextColor="#4B5563"
                value={folderName}
                onChangeText={setFolderName}
                style={styles.modalInput}
                maxLength={50}
              />
              <TextInput
                placeholder="Description (Optional)"
                placeholderTextColor="#4B5563"
                value={folderDesc}
                onChangeText={setFolderDesc}
                style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
                multiline
                maxLength={200}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setShowEditModal(false);
                    setFolderName("");
                    setFolderDesc("");
                  }}
                  style={styles.modalCancel}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditFolder}
                  disabled={!folderName.trim() || submitting}
                  style={[styles.modalSubmit, (!folderName.trim() || submitting) && styles.disabledBtn]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#1E1E1E" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Saved Posts" canGoBack />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab("all")}
          style={[styles.tabButton, activeTab === "all" && styles.tabButtonActive]}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.tabTextActive]}>
            All Saved
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("folders")}
          style={[styles.tabButton, activeTab === "folders" && styles.tabButtonActive]}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === "folders" && styles.tabTextActive]}>
            Collections
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "all" ? (
        <PostsInfiniteList variant="saved" bottomPadding={80} />
      ) : (
        <View style={{ flex: 1 }}>
          {loadingFolders ? (
            <View style={styles.centerSpinner}>
              <ActivityIndicator size="large" color="#FACC15" />
            </View>
          ) : (
            <FlatList
              data={folders}
              keyExtractor={(item) => String(item._id)}
              renderItem={renderFolderCard}
              numColumns={2}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.gridContainer}
              ListHeaderComponent={
                <TouchableOpacity
                  onPress={() => {
                    setFolderName("");
                    setFolderDesc("");
                    setShowCreateModal(true);
                  }}
                  style={styles.createCard}
                  activeOpacity={0.8}
                >
                  <Icon name="FolderPlus" size={24} color="#FACC15" />
                  <Text style={styles.createCardText}>New Collection</Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <View style={styles.emptyGrid}>
                  <Icon name="Folder" size={48} color="#4B5563" />
                  <Text style={styles.emptyGridText}>No custom collections yet</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* Options Menu Modal for Folder Card */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {activeMenuFolder?.name}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                setShowMenuModal(false);
                if (activeMenuFolder) openEditModal(activeMenuFolder);
              }}
              style={styles.menuItem}
            >
              <Icon name="Edit" size={18} color="#F9FBFF" />
              <Text style={styles.menuItemText}>Edit Collection Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowMenuModal(false);
                if (activeMenuFolder) handleDeleteFolder(activeMenuFolder);
              }}
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
            >
              <Icon name="Trash2" size={18} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: "#EF4444" }]}>Delete Collection</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowMenuModal(false)}
              style={styles.menuCancelBtn}
            >
              <Text style={styles.menuCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Create Folder Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowCreateModal(false);
          setFolderName("");
          setFolderDesc("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Collection</Text>
            <TextInput
              placeholder="Collection Name"
              placeholderTextColor="#4B5563"
              value={folderName}
              onChangeText={setFolderName}
              style={styles.modalInput}
              maxLength={50}
              autoFocus
            />
            <TextInput
              placeholder="Description (Optional)"
              placeholderTextColor="#4B5563"
              value={folderDesc}
              onChangeText={setFolderDesc}
              style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
              multiline
              maxLength={200}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setFolderName("");
                  setFolderDesc("");
                }}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateFolder}
                disabled={!folderName.trim() || submitting}
                style={[styles.modalSubmit, (!folderName.trim() || submitting) && styles.disabledBtn]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#1E1E1E" />
                ) : (
                  <Text style={styles.modalSubmitText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Folder Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowEditModal(false);
          setFolderName("");
          setFolderDesc("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Collection</Text>
            <TextInput
              placeholder="Name"
              placeholderTextColor="#4B5563"
              value={folderName}
              onChangeText={setFolderName}
              style={styles.modalInput}
              maxLength={50}
            />
            <TextInput
              placeholder="Description (Optional)"
              placeholderTextColor="#4B5563"
              value={folderDesc}
              onChangeText={setFolderDesc}
              style={[styles.modalInput, { height: 70, textAlignVertical: "top" }]}
              multiline
              maxLength={200}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowEditModal(false);
                  setFolderName("");
                  setFolderDesc("");
                }}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditFolder}
                disabled={!folderName.trim() || submitting}
                style={[styles.modalSubmit, (!folderName.trim() || submitting) && styles.disabledBtn]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#1E1E1E" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabText: {
    color: "#6F7174",
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#F9FBFF",
  },
  centerSpinner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  row: {
    justifyContent: "space-between",
  },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  createCardText: {
    color: "#FACC15",
    fontSize: 14,
    fontWeight: "600",
  },
  folderCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 16,
    overflow: "hidden",
  },
  folderCardContent: {
    padding: 14,
  },
  folderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  folderIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(250,204,21,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  folderName: {
    color: "#F9FBFF",
    fontSize: 15,
    fontWeight: "700",
  },
  folderCount: {
    color: "#8B8D90",
    fontSize: 11,
    marginTop: 2,
  },
  folderDescription: {
    color: "#6F7174",
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyGridText: {
    color: "#6F7174",
    fontSize: 14,
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#161618",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    color: "#F9FBFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    color: "#F9FBFF",
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  modalCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  modalSubmit: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#FACC15",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitText: {
    color: "#1E1E1E",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.5,
  },
  menuContainer: {
    width: "85%",
    backgroundColor: "#161618",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    padding: 6,
  },
  menuHeader: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  menuTitle: {
    color: "#8B8D90",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  menuItemText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
  menuCancelBtn: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
    marginHorizontal: 10,
    marginBottom: 6,
  },
  menuCancelBtnText: {
    color: "#F9FBFF",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SavedPostsScreen;
