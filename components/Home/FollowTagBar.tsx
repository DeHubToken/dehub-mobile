import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { useAuthState } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs";
import { followTag, getFollowedTags, unfollowTag } from "../../services/followed-tags.service";

export const FOLLOWED_TAGS_QUERY_KEY = ["followed-tags"] as const;

/**
 * Shown at the top of the home feed while it is narrowed to one hashtag —
 * where a tapped #tag lands. Follow brings the tag's posts into the Following
 * feed beside the people you follow (Mastodon's tag follows); the server does
 * the mixing, this only keeps the list. Same as web's FollowTagBar.
 */
export default function FollowTagBar({ tag, onClear }: { tag: string; onClear: () => void }) {
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const queryClient = useQueryClient();
  const name = tag.replace(/^#+/, "").toLowerCase();

  const { data: followed = [] } = useQuery({
    queryKey: FOLLOWED_TAGS_QUERY_KEY,
    queryFn: getFollowedTags,
    enabled: isSignedIn,
    staleTime: 5 * 60 * 1000,
  });
  const following = followed.includes(name);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await followTag(name);
      else await unfollowTag(name);
      return next;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: FOLLOWED_TAGS_QUERY_KEY });
      const prev = queryClient.getQueryData<string[]>(FOLLOWED_TAGS_QUERY_KEY);
      queryClient.setQueryData<string[]>(FOLLOWED_TAGS_QUERY_KEY, (old = []) =>
        next ? Array.from(new Set([...old, name])) : old.filter((x) => x !== name),
      );
      return { prev };
    },
    onSuccess: (next) => {
      toastSuccess(t(next ? "followedTags.followed" : "followedTags.unfollowed", { tag: name }));
    },
    onError: (_err, _next, context) => {
      if (context?.prev) queryClient.setQueryData(FOLLOWED_TAGS_QUERY_KEY, context.prev);
      toastError(t("followedTags.failed"));
    },
  });

  return (
    <View testID="follow-tag-bar" className="mx-4 mb-3 flex-row items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <Icon name="Hash" size={16} color="#8B8D90" />
      <Text className="ml-2 flex-1 text-sm font-semibold text-white" numberOfLines={1}>{name}</Text>
      {isSignedIn && (
        <TouchableOpacity
          onPress={() => mutation.mutate(!following)}
          disabled={mutation.isPending}
          accessibilityRole="button"
          accessibilityState={{ selected: following, disabled: mutation.isPending }}
          accessibilityLabel={following ? t("followedTags.unfollow", { tag: name }) : t("followedTags.follow", { tag: name })}
          className={`ml-2 rounded-full px-3 py-1 ${following ? "border border-white/20" : "bg-white"}`}
        >
          <Text className={`text-xs font-semibold ${following ? "text-white" : "text-black"}`}>
            {following ? t("followedTags.following") : t("followedTags.follow", { tag: name })}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel={t("followedTags.clear")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="ml-2 p-1"
      >
        <Icon name="X" size={16} color="#8B8D90" />
      </TouchableOpacity>
    </View>
  );
}
