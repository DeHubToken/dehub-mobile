import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { TouchableOpacity } from "react-native";
import GlassModal from "../ui/GlassModal";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";

const CreateStageModal: React.FC = () => {
  const { isModalOpen, initialModalView, isLoading, createSpace, openModal, closeModal } = useStages();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  if (!isModalOpen || initialModalView !== "create") return null;

  const handleBack = () => openModal("browse");
  const handleCreate = async () => {
    if (!title.trim()) return;
    setError("");
    const space = await createSpace(title.trim());
    if (space) {
      setTitle("");
      openModal("live");
    } else {
      setError("Failed to start stage. Please try again.");
    }
  };

  return (
    <GlassModal visible={true} onClose={closeModal} presentation="bottom">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Icon name="ArrowLeft" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Start a Stage</Text>
          <View style={{ width: 20 }} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Stage title..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={title}
          onChangeText={setTitle}
          autoFocus
          maxLength={80}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          onPress={handleCreate}
          disabled={!title.trim() || isLoading}
          style={[styles.goLiveBtn, (!title.trim() || isLoading) && styles.disabled]}
        >
          <Icon name="Radio" size={18} color="#FFFFFF" />
          <Text style={styles.goLiveText}>
            {isLoading ? "Starting..." : "Go Live"}
          </Text>
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFFFFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 16,
  },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 12,
  },
  goLiveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
});

export default CreateStageModal;
