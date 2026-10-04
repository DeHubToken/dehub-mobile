import React, { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from '../ui/Icon';
import GlassModal from '../ui/GlassModal';
import ShareToDmSheet from '../DM/ShareToDmSheet';
import { useUser } from '../../context/AuthContext';
import { ScreenNames } from '../../navigation/ScreenNames';
import { WEBSITE_LINK } from '../../config';
import { toastSuccess } from '../../libs/toast';
import type { WorkJob } from '../../hooks/useWork';

export default function BountyShareButton({ job }: { job: WorkJob }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const url = `${WEBSITE_LINK}/bounty/${job.job_number}`;

  const later = (action: () => void) => {
    setOpen(false);
    setTimeout(action, 300);
  };
  const authenticated = (action: () => void) => {
    later(() => {
      if (!user) navigation.navigate(ScreenNames.SignIn);
      else action();
    });
  };
  const row = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <Icon name={icon} size={20} color="#E4E4E7" />
      <Text style={{ color: '#F4F4F5', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Pressable
        onPress={(event) => { event.stopPropagation(); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={t('postOptions.share')}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Icon name="Share2" size={17} color="#E4E4E7" />
        <Text style={{ color: '#F4F4F5', fontSize: 12 }}>{t('postOptions.share')}</Text>
      </Pressable>
      <GlassModal visible={open} onClose={() => setOpen(false)} presentation="bottom" scrollable maxHeight="70%" blurIntensity={50}>
        <View style={{ padding: 12, paddingBottom: 24 }}>
          <Text style={{ color: '#F4F4F5', fontSize: 16, fontWeight: '600', padding: 14 }}>{job.title}</Text>
          {row('Link', t('postOptions.copyLink'), () => {
            void Clipboard.setStringAsync(url).then(() => {
              toastSuccess(t('postOptions.linkCopied'));
              setOpen(false);
            });
          })}
          {row('Send', t('feedCard.sendInMessage'), () => authenticated(() => setDmOpen(true)))}
          {row('MessageSquare', t('buyCoins.shareToFeed'), () => authenticated(() => navigation.navigate(ScreenNames.Upload, { tab: 'feed', initialText: url })))}
          {row('Share2', t('feedCard.moreShare'), () => later(() => {
            void Share.share({ message: `${job.title}\n${url}`, url, title: job.title }).catch(() => {});
          }))}
        </View>
      </GlassModal>
      <ShareToDmSheet visible={dmOpen} onClose={() => setDmOpen(false)} url={url} postTitle={job.title} />
    </>
  );
}
