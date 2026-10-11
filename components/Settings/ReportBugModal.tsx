import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import GlassModal from '../ui/GlassModal';
import { useAuthActions, useAuthState, useUser } from '../../context/AuthContext';
import { useSubmitFeatureRequest, type FeatureAttachment } from '../../hooks/useFeatureRequests';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { describePageBug, pageBugContext, type PageBugContext } from '../../libs/pageBugReport';

type Props = { visible: boolean; onClose: () => void; username?: string | null; context?: PageBugContext };
export default function ReportBugModal({ visible, onClose, context }: Props) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthActions();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const [details, setDetails] = useState(() => context || pageBugContext('AccountSettings'));
  const [message, setMessage] = useSurfaceDraft('quick-page-bug', '', details.screen);
  const [attachment, setAttachment] = useState<FeatureAttachment | null>(null);
  const [failed, setFailed] = useState(false);
  const submit = useSubmitFeatureRequest();
  const submitting = useRef(false);
  useEffect(() => {
    if (visible) { setDetails(context || pageBugContext('AccountSettings')); setFailed(false); }
    else setAttachment(null);
  }, [visible, context]);
  const close = () => { if (!submitting.current) onClose(); };
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 20 * 1024 * 1024) { setFailed(true); return; }
        setAttachment({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      }
    } catch { setFailed(true); }
  };
  const send = async () => {
    if (!message.trim() || submitting.current) return;
    if (!isSignedIn || !user) { onClose(); requireAuth(() => {}); return; }
    submitting.current = true; setFailed(false);
    try {
      await submit.mutateAsync({ title: message.trim().replace(/\s+/g, ' ').slice(0, 120), description: describePageBug(message, details), category: 'bug_fix', attachments: attachment ? [attachment] : [] });
      setAttachment(null); if (setMessage.complete(message, '')) onClose();
    } catch { setFailed(true); } finally { submitting.current = false; }
  };
  return <GlassModal visible={visible} onClose={close} presentation="bottom" scrollable dismissible={!submit.isPending}>
    <View className="p-5">
      <Text className="text-theme-foreground font-bold text-lg mb-2">{t('quickActions.question')}</Text>
      <Text className="text-theme-neutrals-400 text-sm mb-4">{t('quickActions.publicNotice')}</Text>
      <TextInput accessibilityLabel={t('quickActions.question')} value={message} onChangeText={setMessage} maxLength={1500} multiline textAlignVertical="top" placeholder={t('quickActions.placeholder')} placeholderTextColor="#888" className="bg-theme-neutrals-800 text-theme-foreground border border-theme-neutrals-700 rounded-xl p-3 min-h-28" />
      <Text className="text-theme-neutrals-400 text-xs mt-3">{details.screen}</Text>
      <Text className="text-theme-neutrals-400 text-xs my-3">{t('quickActions.deviceNotice')}</Text>
      {attachment ? <View>
        <Image accessibilityLabel={t('quickActions.screenshot')} source={{ uri: attachment.uri }} style={{ height: 140, width: '100%', borderRadius: 12 }} resizeMode="contain" />
        <TouchableOpacity accessibilityRole="button" onPress={() => setAttachment(null)} className="py-3"><Text className="text-theme-neutrals-400 text-sm">{t('quickActions.removeScreenshot')}</Text></TouchableOpacity>
      </View> : <TouchableOpacity accessibilityRole="button" onPress={pick} className="py-3"><Text className="text-theme-foreground text-sm">{t('quickActions.attachScreenshot')}</Text></TouchableOpacity>}
      {failed && <Text accessibilityRole="alert" className="text-red-400 text-sm mb-3">{t('quickActions.failed')}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={!message.trim() || submit.isPending} onPress={send} className="bg-theme-accent rounded-xl py-3 items-center" style={{ opacity: message.trim() && !submit.isPending ? 1 : 0.4 }}>
        {submit.isPending ? <ActivityIndicator /> : <Text className="text-theme-accent-foreground font-semibold">{t(isSignedIn ? 'quickActions.send' : 'quickActions.signIn')}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={submit.isPending} onPress={close} className="py-3"><Text className="text-theme-neutrals-400 text-center">{t('common.close')}</Text></TouchableOpacity>
    </View>
  </GlassModal>;
}
