import React, { useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { miniAddress } from "../../libs/strings.util";
import { getDpayTnx } from "../../services";
import { useAuthActions } from "../../context/AuthContext";
import { ethersService } from "../../services/ethers.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useNavigation } from "@react-navigation/native";

type Props = {
  address: string;
  chainId?: number; // fallback chainId if tx data doesn't provide
  tokenSymbol?: string; // default DHB
  initialSid?: string | null;
  onClose: () => void;
};

const DpayCheckoutStatus: React.FC<Props> = ({
  address,
  chainId,
  tokenSymbol = "DHB",
  initialSid,
  onClose,
}) => {
  const navigation = useNavigation<any>();
  const { patchUser } = useAuthActions();
  const [sid, setSid] = React.useState<string | null>(initialSid ?? null);
  const [statusStripe, setStatusStripe] = React.useState<string>("pending");
  const [tokenSendStatus, setTokenSendStatus] = React.useState<string | null>(
    null
  );
  const [txData, setTxData] = React.useState<any | null>(null);
  const [checkingStatus, setCheckingStatus] = React.useState<boolean>(false);
  const [completed, setCompleted] = React.useState<boolean>(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Simple check animation
  const scale = React.useRef(new Animated.Value(0)).current;
  const playCheck = React.useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.1,
        useNativeDriver: true,
        bounciness: 12,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale]);

  // Deep link listener: dehub://dpay-result?sid=...
  React.useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      try {
        const u = new URL(url);
        const host = (u.host || u.hostname || "").toLowerCase();
        const path = (u.pathname || "").toLowerCase();
        const isDpay =
          host.includes("dpay-result") || path.includes("dpay-result");
        if (!isDpay) return;
        const nextSid =
          u.searchParams.get("sid") ||
          u.searchParams.get("session_id") ||
          u.searchParams.get("sessionId");
        if (nextSid) setSid(nextSid);
      } catch {}
    };
    const sub = Linking.addEventListener("url", onUrl);
    Linking.getInitialURL()
      .then((initial) => {
        if (initial) onUrl({ url: initial });
      })
      .catch(() => {});
    return () => {
      sub.remove?.();
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []);

  const fetchTnxStatus = React.useCallback(
    async (overrideSid?: string) => {
      const target = overrideSid ?? sid;
      if (!target) return;
      setCheckingStatus(true);
      try {
        const res: any = await getDpayTnx({ sid: target });
        const ok = !!(res?.success ?? true);
        const dataArr: any[] =
          res?.data?.tnxs || res?.tnxs || res?.result || [];
        if (!ok || !Array.isArray(dataArr) || dataArr.length === 0) {
          setStatusStripe("not_found");
          setTxData(null);
          return;
        }
        const data = dataArr[0];
        setTxData(data);
        setStatusStripe(String(data?.status_stripe || "pending"));
        setTokenSendStatus(data?.tokenSendStatus ?? null);

        // On success (token sent), update balances once
        const sent =
          (data?.tokenSendStatus ?? "").toString().toLowerCase() === "sent";
        if (sent && !completed) {
          setCompleted(true);
          playCheck();
          try {
            const activeChain = Number(data?.chainId ?? chainId ?? 8453);
            const bals = await ethersService.getTokenBalances(
              address,
              activeChain,
              [tokenSymbol]
            );
            await patchUser(
              (prev) =>
                ({
                  tokenBalances: { ...(prev?.tokenBalances || {}), ...bals },
                } as any)
            );
          } catch {}
        }
      } catch (err) {
        setStatusStripe("failed");
      } finally {
        setCheckingStatus(false);
      }
    },
    [sid, address, chainId, tokenSymbol, patchUser, completed, playCheck]
  );

  const shouldPoll = React.useMemo(() => {
    const s = (statusStripe || "").toLowerCase();
    const t = (tokenSendStatus || "").toLowerCase();
    if (["failed", "expired", "canceled", "not_found"].includes(s))
      return false;
    if (["sent", "failed"].includes(t)) return false;
    return true;
  }, [statusStripe, tokenSendStatus]);

  React.useEffect(() => {
    if (sid) fetchTnxStatus(sid);
  }, [sid, fetchTnxStatus]);

  React.useEffect(() => {
    if (!sid) return;
    if (shouldPoll) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          if (!checkingStatus) fetchTnxStatus();
        }, 3000);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [sid, shouldPoll, fetchTnxStatus, checkingStatus]);

  const amountStr = React.useMemo(() => {
    const val = Number(
      txData?.tokenReceived ?? txData?.approxTokensToReceive ?? 0
    );
    if (!Number.isFinite(val)) return "";
    return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
      val
    );
  }, [txData]);

  const goProfile = React.useCallback(() => {
    try {
      navigation.navigate(ScreenNames.Root as any, { screen: ScreenNames.Profile });
    } catch {}
    onClose();
  }, [navigation, onClose]);

  const isSuccess = (tokenSendStatus ?? "").toLowerCase() === "sent";

  const handleClose = React.useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    onClose();
  }, [onClose]);

  return (
    <View>
      {isSuccess ? (
        <View className="items-center">
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name="checkmark-circle" size={66} color="#F4F4F5" />
          </Animated.View>
          <Text className="text-white text-xl font-semibold mt-3">Success</Text>
          <Text className="text-gray-300 text-sm mt-1 text-center">
            {amountStr
              ? `${amountStr} ${tokenSymbol} was sent to ${miniAddress(
                  address
                )}`
              : `Tokens were sent to ${miniAddress(address)}`}
          </Text>
          <View className="flex-row mt-5">
            <View className="flex-1 mr-2">
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.9}
                className="rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 py-3 items-center"
              >
                <Text className="text-white text-sm font-semibold">Close</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-1 ml-2">
              <TouchableOpacity
                onPress={goProfile}
                activeOpacity={0.9}
                className="rounded-xl bg-white py-3 items-center"
              >
                <Text className="text-theme-neutrals-900 text-sm font-semibold">
                  Go to Profile
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View>
          <Text className="text-white text-xl font-semibold text-center mb-4">
            Waiting for confirmation…
          </Text>

          <View className="border-t border-theme-neutrals-700/60 mt-2">
            <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
              <Text className="text-gray-300 text-sm">Stripe Status</Text>
              <Text className="text-white text-sm font-semibold">
                {(() => {
                  const s = (statusStripe || "").toLowerCase();
                  if (s === "succeeded") return "Payment completed";
                  if (s === "processing") return "Payment processing";
                  if (s === "requires_action") return "Action required";
                  if (s === "requires_payment_method")
                    return "Awaiting payment method";
                  if (s === "canceled") return "Payment canceled";
                  if (s === "expired") return "Payment expired";
                  if (s === "not_found") return "Session not found";
                  if (s === "failed") return "Payment failed";
                  return "Pending payment";
                })()}
              </Text>
            </View>
            <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
              <Text className="text-gray-300 text-sm">Token Send Status</Text>
              <Text className="text-white text-sm font-semibold">
                {(() => {
                  const t = (tokenSendStatus || "").toLowerCase();
                  if (t === "sent") return "Tokens sent";
                  if (t === "sending") return "Sending tokens";
                  if (t === "queued") return "Queued for sending";
                  if (t === "failed") return "Token transfer failed";
                  return "Not sent yet";
                })()}
              </Text>
            </View>
            {txData?.tokenSendTxnHash ? (
              <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
                <Text className="text-gray-300 text-sm">Txn Hash</Text>
                <Text className="text-white text-sm font-semibold">
                  {miniAddress(txData.tokenSendTxnHash)}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="items-center mt-2 min-h-[24px]">
            {shouldPoll ? <ActivityIndicator color="#F4F4F5" /> : null}
          </View>
          <Text className="text-gray-400 text-[11px] text-center mt-2 px-4">
            You can leave this screen. Your tokens will arrive in your wallet once your payment is confirmed.
          </Text>

          <View className="mt-5">
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.9}
              className="rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 py-3 items-center"
            >
              <Text className="text-white text-sm font-semibold">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export default DpayCheckoutStatus;
