import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import WorkUser from "./WorkUser";
import type { WorkApplication } from "../../hooks/useWork";
import { useCommentOnApplication, type WorkApplicationComment } from "../../hooks/useApplicationComments";

export default function ApplicationComments({ application, comments, canReply }: {
  application: WorkApplication;
  comments: WorkApplicationComment[];
  canReply: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useSurfaceDraft("components/Work/ApplicationComments.tsx:body", "", application.id);
  const mutation = useCommentOnApplication();
  return (
    <View>
      {comments.length > 0 && (
        <View style={styles.thread}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.comment}>
              <View style={styles.header}>
                <WorkUser address={comment.author_address} size={24} />
                <Text style={styles.time}>{new Date(comment.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.body}>{comment.body}</Text>
            </View>
          ))}
        </View>
      )}
      {canReply && !open && (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.reply}>
          <Icon name="Reply" size={14} color="#FFFFFF" />
          <Text style={styles.replyText}>{t("dm.reply")}</Text>
        </Pressable>
      )}
      {canReply && open && (
        <View style={styles.composer}>
          <TextInput autoFocus accessibilityLabel={t("dm.reply")} placeholder={t("comments.replyPlaceholder")}
            placeholderTextColor="#8B8D90" value={body} onChangeText={setBody} multiline maxLength={2000}
            editable={!mutation.isPending} style={styles.input} />
          {mutation.isError && <Text accessibilityRole="alert" style={styles.error}>{t("common.somethingWentWrong")}</Text>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={!body.trim() || mutation.isPending}
              style={[styles.post, (!body.trim() || mutation.isPending) && styles.disabled]}
              onPress={() => {
                if (!body.trim() || mutation.isPending) return;
                mutation.mutate({ job_id: application.job_id, application_id: application.id, body }, {
                  onSuccess: () => { if (setBody.complete(body, "")) setOpen(false); },
                });
              }}>
              <Text style={styles.postText}>{t("comments.postComment")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={mutation.isPending}
              onPress={() => { mutation.reset(); setOpen(false); }} style={styles.cancel}>
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { marginTop: 12, marginLeft: 8, borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.10)", paddingLeft: 12, gap: 12 },
  comment: { gap: 4 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  time: { color: "#808089", fontSize: 10 },
  body: { color: "#D4D4D8", fontSize: 14, lineHeight: 20 },
  reply: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.10)" },
  replyText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  composer: { marginTop: 12, gap: 8 },
  input: { minHeight: 84, textAlignVertical: "top", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#FFFFFF", fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  post: { borderRadius: 10, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 8 },
  postText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  cancel: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelText: { color: "#A1A1AA", fontSize: 12 },
  error: { color: "#FCA5A5", fontSize: 12 },
  disabled: { opacity: 0.4 },
});
