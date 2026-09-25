import React, { memo, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { truncate } from '../../libs/strings.util';
import { LIVEPEER_RTMP_SERVER } from '../../config/constants';
import { encoderCredentials } from '../../libs/live-ingest';
import Copy from 'lucide-react-native/dist/esm/icons/copy';
import Wifi from 'lucide-react-native/dist/esm/icons/wifi';
import { copyToClipboard } from '../../libs/clipboard.utils';
import { encoderKeyService, type EncoderCredentials } from '../../services/encoder-key.service';

interface ExternalStreamingOverlayProps {
  streamKeyValue: string | null;
  streamKeyLoading: boolean;
  onExitExternal: () => void;
  isLive?: boolean;
  /**
   * This stream's own ingest endpoint, from the mint or /ingesturl.
   *
   * It is not a constant. Streams provisioned on the self-hosted ingest
   * publish to that host, not to Livepeer, and handing their creator
   * Livepeer's endpoint points OBS at a server that will never accept the
   * key. Livepeer's address is the fallback for a Livepeer stream whose URL
   * has not arrived yet, and for nothing else.
   */
  ingestUrl?: string | null;
  /** 'mediamtx' for a self-hosted stream; absent on the older Livepeer ones. */
  provider?: string | null;
}

const ExternalStreamingOverlay: React.FC<ExternalStreamingOverlayProps> = ({
  streamKeyValue,
  streamKeyLoading,
  onExitExternal,
  isLive = false,
  ingestUrl,
  provider,
}) => {
  const { t } = useTranslation();

  /**
   * The creator's PERMANENT credentials.
   *
   * The pair below used to be minted with the post, so a creator had to re-key
   * their encoder before every session — which on a console means typing a
   * long string with a controller. These never change, so they are what is
   * shown wherever the creator has them, and pasting them reaches this same
   * broadcast: the ingest resolves the permanent path to whichever stream is
   * waiting, which is the one this screen belongs to.
   *
   * Only on the self-hosted ingest. A Livepeer stream mints its own key and
   * has no permanent path, so it keeps the per-stream pair.
   */
  const [permanent, setPermanent] = useState<EncoderCredentials | null>(null);

  useEffect(() => {
    if (provider !== 'mediamtx') return;
    let alive = true;
    encoderKeyService
      .get()
      .then(next => {
        if (alive && next.server && next.streamKey) setPermanent(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [provider]);

  const onCopy = (value: string) => () => copyToClipboard(value);
  // OBS joins Server and Stream Key with a slash, so the credentials in a
  // self-hosted URL's query string have to be on the KEY side of that join —
  // otherwise the stream key lands inside the password and the gate refuses it.
  const rawServer =
    ingestUrl || (provider === 'mediamtx' ? null : LIVEPEER_RTMP_SERVER);
  const perStream = encoderCredentials(rawServer, streamKeyValue);
  const serverUrl = permanent ? permanent.server : perStream.server;
  const encoderKey = permanent ? permanent.streamKey : perStream.key;

  const placeholder = streamKeyLoading ? t('common.loading', 'Loading…') : '—';

  return (
    <View className="px-6 w-full items-center">
      {isLive ? (
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-white" />
          <Text className="text-white font-bold text-sm tracking-wider">
            {t('goLive.externalLiveTitle', 'STREAMING FROM EXTERNAL DEVICE')}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-2 mb-3">
          <Wifi color="#A6A9AC" size={16} />
          <Text className="text-white/80 font-semibold text-sm">
            {t('goLive.externalTitle', 'External Streaming Mode')}
          </Text>
        </View>
      )}

      <Text className="text-white/60 text-center text-[11px] leading-5 mb-4">
        {isLive
          ? t(
              'goLive.externalLiveHint',
              'Your stream is live via external software. The in-app camera is disabled.',
            )
          : t(
              'goLive.externalHint',
              'Connect your streaming software using the details below, then start broadcasting.',
            )}
      </Text>

      <View className="w-full max-w-xs">
        <View className="flex-row items-center mb-3 bg-white/5 rounded-xl px-3 py-2">
          <Text className="text-white/50 text-[11px] mr-2 w-20">
            {t('goLive.streamKey', 'Stream Key')}
          </Text>
          <TouchableOpacity
            onPress={encoderKey ? onCopy(encoderKey) : undefined}
            className="flex-1 flex-row items-center"
            disabled={!encoderKey}
          >
            <Text className="text-white/80 text-[11px] flex-1" numberOfLines={1}>
              {encoderKey ? truncate(encoderKey, 30) : placeholder}
            </Text>
            {encoderKey && <Copy size={13} color="#A6A9AC" />}
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center bg-white/5 rounded-xl px-3 py-2">
          <Text className="text-white/50 text-[11px] mr-2 w-20">
            {t('goLive.ingestUrl', 'Server URL')}
          </Text>
          <TouchableOpacity
            onPress={serverUrl ? onCopy(serverUrl) : undefined}
            className="flex-1 flex-row items-center"
            disabled={!serverUrl}
          >
            <Text className="text-white/80 text-[11px] flex-1" numberOfLines={1}>
              {serverUrl ? truncate(serverUrl, 30) : placeholder}
            </Text>
            {serverUrl ? <Copy size={13} color="#A6A9AC" /> : null}
          </TouchableOpacity>
        </View>
      </View>

      {permanent ? (
        <Text className="text-white/40 text-center text-[10px] leading-4 mt-3 max-w-xs">
          {t(
            'goLive.encoderPermanentHint',
            'This key never changes. Set your encoder up once — next time just press Start there and DeHub creates the post for you.',
          )}
        </Text>
      ) : null}

      {!isLive && (
        <TouchableOpacity
          onPress={onExitExternal}
          className="mt-5 self-center px-5 h-10 rounded-xl bg-white/10 items-center justify-center"
          activeOpacity={0.85}
        >
          <Text className="text-white/80 text-xs font-semibold">
            {t('goLive.useInAppCamera', 'Use In-App Camera Instead')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default memo(ExternalStreamingOverlay);
