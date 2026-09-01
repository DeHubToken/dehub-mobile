import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import GlassIndicator, { GLASS_SHADOW } from '../components/ui/GlassIndicator';
import GlassTipSheet from '../components/Tip/GlassTipSheet';
import { formatCompactNumber, toastError, toastSuccess } from '../libs';
import {
  getPendingTvRequests,
  resolveTvRequest,
  secondsRemaining,
  type TvRequest,
} from '../services/tvRequest.service';

/**
 * Requests raised by a television, waiting for this phone to sign.
 *
 * A DeHub TV can watch but not spend — it holds no wallet key, which is what
 * makes it safe to leave signed in on an appliance in a shared room. When
 * someone presses Tip over there, the TV raises a request; this screen is where
 * it gets answered, using the wallet this device already has.
 *
 * Two things shape it.
 *
 * **It shows what is being approved, in full.** The amount, who receives it,
 * which post, and which television asked. An approval prompt that does not say
 * precisely what it is approving trains people to approve anything, and this
 * one moves money.
 *
 * **A request ages out in front of you.** The countdown is not decoration: the
 * server expires these after a few minutes and will refuse a late approval, so
 * a prompt sitting there with no visible clock would let someone tap Approve
 * and get a confusing failure instead of an obvious "too late".
 */
export default function TvRequestsScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<TvRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<TvRequest | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const rows = await getPendingTvRequests();
    setRequests(rows.filter((r) => secondsRemaining(r) > 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Polls only while this screen is mounted. A background poll for something
    // this rare would cost battery every day to catch an event that happens
    // once in a while; the push notification is the right answer for that and
    // is not built yet.
    poll.current = setInterval(() => void load(), 10_000);
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [load]);

  // Re-render once a second so the countdown actually counts and an expired
  // card leaves the list rather than sitting there looking answerable.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  const visible = requests.filter((r) => secondsRemaining(r) > 0);

  const decline = useCallback(
    async (request: TvRequest) => {
      setResolving(request.requestId);
      const ok = await resolveTvRequest(request.requestId, { status: 'rejected' });
      setResolving(null);
      if (ok) {
        setRequests((prev) => prev.filter((r) => r.requestId !== request.requestId));
      } else {
        toastError('Could not decline that — it may have already expired.');
        void load();
      }
    },
    [load],
  );

  /**
   * The tip went through. Report the hash so the television can stop waiting
   * and say so.
   *
   * The money has already moved by this point, so a failure here is a reporting
   * failure, never a payment one — hence the wording. Telling the user their
   * tip failed because a status call did would be actively false.
   */
  const onSigned = useCallback(
    async (request: TvRequest, amount: number, txHash?: string) => {
      setActive(null);
      if (!txHash) {
        toastError('Tip sent, but the TV could not be told. It will time out.');
        void load();
        return;
      }
      const ok = await resolveTvRequest(request.requestId, { status: 'approved', txHash });
      setRequests((prev) => prev.filter((r) => r.requestId !== request.requestId));
      if (ok) toastSuccess(`Sent ${formatCompactNumber(amount)} DHB`);
      else toastError('Tip sent, but the TV could not be told. It will time out.');
    },
    [load],
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="TV requests" />

      <FlatList
        data={visible}
        keyExtractor={(item) => item.requestId}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 32,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor="#9ca3af"
          />
        }
        ListEmptyComponent={
          loading ? (
            <View className="flex-1 items-center justify-center py-24">
              <ActivityIndicator color="#9ca3af" />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center py-24 px-8">
              <Icon name="Tv" size={40} color="#383A3D" />
              <Text className="text-white text-base font-semibold mt-4">Nothing waiting</Text>
              <Text className="text-theme-neutrals-500 text-sm mt-2 text-center">
                When you tip from DeHub on your television, it appears here for you to
                approve. Your TV never holds your wallet.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <RequestCard
            request={item}
            busy={resolving === item.requestId}
            onApprove={() => setActive(item)}
            onDecline={() => void decline(item)}
          />
        )}
      />

      {!!active && (
        <GlassTipSheet
          // Keyed on the request so a different one always gets a fresh sheet.
          // `GlassTipSheet` seeds its amount from `lockedAmount` inside an
          // effect that only runs when `visible` changes — swapping the request
          // underneath a mounted sheet would leave the previous amount in the
          // field while the card behind it showed the new one, and approving
          // would then sign for the wrong figure. Unreachable today because the
          // sheet covers the list, but this is a money path and one line.
          key={active.requestId}
          visible
          onClose={() => setActive(null)}
          toAddress={String(active.payload.recipient ?? '')}
          tokenId={Number(active.payload.tokenId ?? 0)}
          recipientName={active.payload.recipientName as string | undefined}
          lockedAmount={Number(active.payload.amount ?? 0)}
          onSuccess={(amount, txHash) => void onSigned(active, amount, txHash)}
        />
      )}
    </View>
  );
}

const RequestCard = React.memo<{
  request: TvRequest;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}>(({ request, busy, onApprove, onDecline }) => {
  const left = secondsRemaining(request);
  const amount = Number(request.payload.amount ?? 0);
  const to = (request.payload.recipientName as string) || shorten(String(request.payload.recipient ?? ''));

  return (
    <View className="rounded-xl overflow-hidden mb-3" style={GLASS_SHADOW}>
      <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-4 py-4">
        <View className="flex-row items-center mb-3">
          <View className="w-10 h-10 rounded-xl bg-theme-neutrals-700/50 items-center justify-center mr-3">
            <Icon name="Tv" size={20} color="#9ca3af" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-sm font-semibold">
              {request.deviceName || 'Your television'}
            </Text>
            <Text className="text-theme-neutrals-500 text-xs mt-0.5">
              wants to send a tip · {formatCountdown(left)} left
            </Text>
          </View>
        </View>

        <View className="bg-theme-neutrals-900/60 rounded-lg px-3 py-3 mb-3">
          <Text className="text-white text-lg font-bold">
            {formatCompactNumber(amount)} DHB
          </Text>
          <Text className="text-theme-neutrals-300 text-sm mt-0.5">to {to}</Text>
          {!!request.payload.postTitle && (
            <Text className="text-theme-neutrals-500 text-xs mt-1" numberOfLines={1}>
              for “{String(request.payload.postTitle)}”
            </Text>
          )}
        </View>

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={onApprove}
            disabled={busy}
            activeOpacity={0.7}
            accessibilityRole="button"
            className="flex-1 rounded-xl overflow-hidden"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <View className="px-4 py-3 rounded-xl items-center overflow-hidden" style={GLASS_SHADOW}>
              <GlassIndicator borderRadius={12} />
              <Text className="text-white text-sm font-semibold">Review and approve</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDecline}
            disabled={busy}
            activeOpacity={0.7}
            accessibilityRole="button"
            className="px-4 py-3 rounded-xl border border-theme-neutrals-700 items-center justify-center"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#F4F4F5" />
            ) : (
              <Text className="text-theme-neutrals-300 text-sm font-semibold">Decline</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

RequestCard.displayName = 'RequestCard';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function shorten(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
