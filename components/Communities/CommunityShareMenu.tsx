import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from '../ui/Icon';
import GlassModal from '../ui/GlassModal';
import ShareToDmSheet from '../DM/ShareToDmSheet';
import InviteFollowers from './InviteFollowers';
import { shareWithRef } from '../../libs/shareRef';
import { copyToClipboard } from '../../libs';
import { toastSuccess } from '../../libs/toast';
import { ScreenNames } from '../../navigation/ScreenNames';
import { ShareLinks } from '../../navigation/linking.config';
import type { Community } from '../../types/community';

/**
 * The community Share drawer, matching web's Share menu: invite followers,
 * post the link, send it in a message, copy it. The phone's own share sheet
 * opens only from "Share link".
 */
export default function CommunityShareMenu({ open, onClose, community, wallet, canInvite, isMember }: {
  open: boolean;
  onClose: () => void;
  community: Community;
  wallet: string;
  canInvite: boolean;
  isMember: boolean;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [dmOpen, setDmOpen] = useState(false);
  const [followersOpen, setFollowersOpen] = useState(false);
  const url = ShareLinks.community(community.slug);

  // Lets the drawer finish closing before the next sheet or screen opens.
  const later = (action: () => void) => {
    onClose();
    setTimeout(action, 300);
  };
  const signedIn = (action: () => void) => later(() => {
    if (!wallet) navigation.navigate(ScreenNames.SignIn);
    else action();
  });
  const row = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <Icon name={icon} size={20} color="#E4E4E7" />
      <Text style={{ color: '#F4F4F5', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <GlassModal visible={open} onClose={onClose} presentation="bottom" scrollable maxHeight="70%" blurIntensity={50}>
        <View style={{ padding: 12, paddingBottom: 24 }}>
          <Text numberOfLines={1} style={{ color: '#F4F4F5', fontSize: 16, fontWeight: '600', padding: 14 }}>{community.name}</Text>
          {isMember && canInvite && !!wallet && row('Users', t('communities.followerInvites.title'), () => later(() => setFollowersOpen(true)))}
          {row('FileText', t('communities.post'), () => signedIn(() => navigation.navigate(ScreenNames.Upload, { tab: 'feed', initialText: url })))}
          {canInvite && row('Send', t('communities.sendInMessage'), () => signedIn(() => setDmOpen(true)))}
          {row('Link', t('communities.copyLink'), () => {
            copyToClipboard(url);
            toastSuccess(t('communities.linkCopied'));
            onClose();
          })}
          {row('Share2', t('communities.shareLink'), () => later(() => {
            void shareWithRef({ message: `${t('communities.shareMessage', { name: community.name })}\n${url}`, url }).catch(() => {});
          }))}
        </View>
      </GlassModal>
      <ShareToDmSheet visible={dmOpen} onClose={() => setDmOpen(false)} url={url} postTitle={community.name} />
      {isMember && canInvite && !!wallet && <InviteFollowers open={followersOpen} onClose={() => setFollowersOpen(false)} communityId={community.id} slug={community.slug} wallet={wallet} />}
    </>
  );
}
