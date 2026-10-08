import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { useCloudProjects } from "../../libs/editor/useCloudProjects";
import { projectReviewTime, type ProjectReviewComment, type ProjectReviewRole } from "../../libs/editor/cloudProjectReview";
import Icon from "../ui/Icon";

export function ProjectReviewPanel({cloud,wallet}: {cloud:ReturnType<typeof useCloudProjects>;wallet:string}) {
  const {t}=useTranslation(), review=cloud.review;
  const [body,setBody]=useState(""), [time,setTime]=useState("0"), [assignee,setAssignee]=useState("");
  const [recipient,setRecipient]=useState(""), [role,setRole]=useState<ProjectReviewRole>("commenter"), [reply,setReply]=useState<ProjectReviewComment|null>(null);
  useEffect(()=>{setBody("");setTime("0");setAssignee("");setRecipient("");setReply(null);},[review?.ownerWallet,review?.projectId,review?.revision]);
  if(!review) return null;
  const owner=review.ownerWallet===wallet, canComment=review.role!=="viewer", pending=cloud.busy || !cloud.available;
  const short=(value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`;
  const roots=cloud.comments.filter(comment=>!comment.parentId);
  const button=(label:string,onPress:()=>void,disabled=pending)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} className="rounded-xl border border-white/15 px-3 py-2" style={{opacity:disabled?0.4:1}}><Text className="text-white">{label}</Text></Pressable>;
  return <View style={{gap:12}}>
    <View className="flex-row items-center" style={{gap:8}}><Text className="flex-1 text-white font-semibold" numberOfLines={2}>{t("editor.review.title")}{" · "}{review.title || t("creator.untitled")}</Text><Pressable accessibilityRole="button" accessibilityLabel={t("dex.refresh")} disabled={pending} onPress={()=>{void cloud.refreshReview();}} className="p-2"><Icon name="RefreshCw" size={20} color="#fff" /></Pressable></View>
    <Text className="text-theme-neutrals-400 text-xs">{review.revision}{" · "}{owner ? t("communities.roles.owner") : canComment ? t("settings.comments") : t("depin.viewer")}</Text>
    <View className="flex-row flex-wrap" style={{gap:8}}>{button(t("common.copy"),()=>{void cloud.openReview();})}{button(t("common.goBack"),cloud.clearReview)}</View>
    {owner && <View className="rounded-xl border border-white/10 p-3" style={{gap:10}}>
      <Text className="text-white font-semibold">{t("postOptions.share")}</Text>
      <TextInput value={recipient} onChangeText={setRecipient} editable={!pending} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("dpay.walletAddress")} placeholder={t("dpay.walletAddress")} placeholderTextColor="rgba(255,255,255,0.5)" className="rounded-xl border border-white/15 px-3 py-3 text-white" style={{backgroundColor:"rgba(255,255,255,0.05)"}} />
      <View className="flex-row flex-wrap" style={{gap:8}}>{(["viewer","commenter"] as const).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:role===value}} disabled={pending} onPress={()=>setRole(value)} className="rounded-xl border border-white/15 px-3 py-2" style={{backgroundColor:role===value?"rgba(255,255,255,0.15)":"transparent"}}><Text className="text-white">{value==="viewer"?t("depin.viewer"):t("settings.comments")}</Text></Pressable>)}{button(t("postOptions.share"),()=>{void cloud.shareReview(recipient,role,()=>setRecipient(""));},pending || !recipient.trim())}</View>
      {cloud.members.filter(member=>!member.revoked).map(member=><View key={member.memberWallet} className="flex-row items-center" style={{gap:6}}><Text className="flex-1 text-white text-xs">{short(member.memberWallet)}{" · "}{member.role==="viewer"?t("depin.viewer"):t("settings.comments")}{" · "}{member.accepted?"✓":"…"}</Text>{button(t("communities.manage.revoke"),()=>{void cloud.shareReview(member.memberWallet,"none");})}</View>)}
    </View>}
    <Text className="text-white font-semibold">{t("settings.comments")}</Text>
    {!roots.length && <Text className="text-theme-neutrals-400">{t("common.noResults")}</Text>}
    {roots.map(comment=><View key={comment.id} className="rounded-xl border border-white/10 p-3" style={{gap:8,opacity:comment.resolved?0.6:1}}>
      <View className="flex-row flex-wrap items-center" style={{gap:8}}>{button(`${comment.revision} · ${projectReviewTime(comment.atSeconds)}`,()=>{void cloud.openReview(comment.revision,comment.atSeconds);})}<Text className="text-theme-neutrals-400 text-xs">{short(comment.authorWallet)}{comment.resolved?` · ${t("support.status.resolved")}`:""}</Text></View>
      <Text className="text-white">{comment.body}</Text>
      {!!comment.assigneeWallet && <Text className="text-theme-neutrals-400 text-xs">{t("editor.review.assign")}{" · "}{short(comment.assigneeWallet)}</Text>}
      {cloud.comments.filter(child=>child.parentId===comment.id).map(child=><View key={child.id} className="border-l border-white/20 pl-3" style={{gap:4}}><Text className="text-theme-neutrals-400 text-xs">{short(child.authorWallet)}</Text><Text className="text-white">{child.body}</Text></View>)}
      {canComment && <View className="flex-row flex-wrap" style={{gap:8}}>{button(t("tv.reply"),()=>setReply(comment))}{(owner || comment.authorWallet===wallet || comment.assigneeWallet===wallet) && button(comment.resolved?t("support.status.open"):t("work.resolve"),()=>{void cloud.resolveReviewComment(comment);})}</View>}
    </View>)}
    {canComment && <View className="rounded-xl border border-white/10 p-3" style={{gap:10}}>
      {reply && <View className="flex-row flex-wrap items-center" style={{gap:8}}><Text className="text-white text-xs">{t("tv.reply")}{" · "}{reply.revision}{" · "}{projectReviewTime(reply.atSeconds)}</Text>{button(t("common.cancel"),()=>setReply(null))}</View>}
      <Text className="text-theme-neutrals-400 text-xs">{t("editor.review.time")}</Text>
      <TextInput value={reply?String(reply.atSeconds):time} onChangeText={setTime} keyboardType="decimal-pad" editable={!pending && !reply} accessibilityLabel={t("editor.review.time")} className="rounded-xl border border-white/15 px-3 py-3 text-white" style={{backgroundColor:"rgba(255,255,255,0.05)"}} />
      <TextInput value={body} onChangeText={setBody} multiline editable={!pending} accessibilityLabel={t("settings.comments")} placeholder={t("settings.comments")} placeholderTextColor="rgba(255,255,255,0.5)" className="rounded-xl border border-white/15 px-3 py-3 text-white" style={{backgroundColor:"rgba(255,255,255,0.05)",minHeight:80}} />
      {!reply && <TextInput value={assignee} onChangeText={setAssignee} editable={!pending} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.review.assign")} placeholder={t("editor.review.assign")} placeholderTextColor="rgba(255,255,255,0.5)" className="rounded-xl border border-white/15 px-3 py-3 text-white" style={{backgroundColor:"rgba(255,255,255,0.05)"}} />}
      {button(t("editor.agent.send"),()=>{void cloud.addReviewComment({body,revision:reply?.revision ?? review.revision,atSeconds:reply?.atSeconds ?? Number(time.replace(",",".")),clipId:reply?.clipId,parentId:reply?.id,assigneeWallet:reply?null:assignee || null},()=>{setBody("");setReply(null);setAssignee("");});},pending || !body.trim() || (!reply && !time.trim()))}
    </View>}
  </View>;
}
