import React, { useEffect, useCallback, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../../context/AuthContext";
import { miniAddress } from "../../libs/strings.util";
import PrimaryButton from "../ui/PrimaryButton";
import Dropdown from "../ui/Dropdown";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { supportedCurrencies, ChainId } from "../../config/constants";
import { supportedNetworks } from "../../config/web3.constants";
import GlassModal from "../ui/GlassModal";
import { useDebounceCallback } from "../../hooks/useDebounceCallback";
import { dpayCreateOrder, getDpayPrice } from "../../services";
import { toastError, toastSuccess } from "../../libs/toast";
import { WEBSITE_LINK, TERMS_OF_SERVICE_LINK, LEGACY_WEBSITE_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";
import { theme } from "../../theme";
import { appScheme } from "../../config/web3.constants";
import DpayCheckoutStatus from "./DpayCheckoutStatus";
// Auth signing not required here; apiClient handles auth via isAuthRequired

type DpayTopUpFormProps = {
  priceUsd?: number; // deprecated: dynamic pricing now
  initialPrice?: number | null;
  supplyData?: Record<string, Record<string, number>>;
  onRequestPrice?: (args: {
    currency: string;
    amount: number;
    tokenSymbol: string;
    chainId: number;
  }) => Promise<number | null>;
};

const DpayTopUpForm: React.FC<DpayTopUpFormProps> = ({
  priceUsd,
  initialPrice,
  supplyData,
  onRequestPrice,
}) => {
  const user = useUser() as any;
  const address: string | undefined = (user?.walletAddress || user?.address) as
    | string
    | undefined;
  const [amountUsd, setAmountUsd] = React.useState<string>("10");
  const [currency, setCurrency] = React.useState<string>("usd");
  const [chain, setChain] = React.useState<string>(
    String(ChainId.BASE_MAINNET)
  );
  const [tokenPrice, setTokenPrice] = React.useState<number | null>(
    initialPrice ?? null
  );
  const [loadingPrice, setLoadingPrice] = React.useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = React.useState<boolean>(false);
  const [loadingCheckout, setLoadingCheckout] = React.useState<boolean>(false);
  const [statusVisible, setStatusVisible] = React.useState<boolean>(false);
  const [statusSid, setStatusSid] = React.useState<string | null>(null);
  const tokenSymbol = "DHB"; // backend symbol
  const onRequestPriceRef =
    React.useRef<DpayTopUpFormProps["onRequestPrice"]>(onRequestPrice);
  React.useEffect(() => {
    onRequestPriceRef.current = onRequestPrice;
  }, [onRequestPrice]);

  // Mount/Unmount traces
  React.useEffect(() => {
    // component mount/unmount
    return () => {};
  }, []);

  const currencyOptions = React.useMemo(
    () =>
      supportedCurrencies.map((c) => ({
        label: c.code.toUpperCase(),
        value: c.code,
        // disabled: c.code !== "usd", // restrict to USD for now; others coming soon
      })),
    []
  );

  const chainOptions = React.useMemo(() => {
    // Dpay is Base-only for now
    return supportedNetworks
      .filter((n: any) => n.chainId === ChainId.BASE_MAINNET)
      .map((n: any) => ({
        label: n.label || n.name || "Base",
        value: String(n.chainId),
      }));
  }, []);

  const approxReceive = React.useMemo(() => {
    const amt = parseFloat(amountUsd || "0");
    const price =
      typeof tokenPrice === "number"
        ? tokenPrice
        : typeof priceUsd === "number"
        ? priceUsd
        : 0;
    if (!Number.isFinite(amt) || !price || price <= 0) return "0";
    const gross = amt / price;
    const fee = gross * 0.1; // 10% fee
    const net = gross - fee;
    return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
      net
    );
  }, [amountUsd, tokenPrice, priceUsd]);

  // Derived numeric helpers
  const parsedAmount = React.useMemo(
    () => parseFloat(amountUsd || "0"),
    [amountUsd]
  );
  const computedPrice = React.useMemo(
    () =>
      typeof tokenPrice === "number"
        ? tokenPrice
        : typeof priceUsd === "number"
        ? priceUsd
        : 0,
    [tokenPrice, priceUsd]
  );
  const netTokens = React.useMemo(() => {
    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      !computedPrice ||
      computedPrice <= 0
    )
      return 0;
    const gross = parsedAmount / computedPrice;
    return gross - gross * 0.1;
  }, [parsedAmount, computedPrice]);
  const supplyOnChain = React.useMemo(() => {
    if (!supplyData) return undefined as number | undefined;
    const keyA = (supplyData as any)?.[String(chain)];
    const keyB = (supplyData as any)?.[Number(chain) as any];
    const map = keyA ?? keyB;
    if (!map || typeof map !== "object") return undefined;
    const val = (map as any)?.DHB ?? (map as any)?.dhb;
    return typeof val === "number" ? val : undefined;
  }, [supplyData, chain]);
  const amountValidationError = React.useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return "Enter a valid amount greater than 0.";
    // if (!computedPrice || computedPrice <= 0) return "Price unavailable. Try again shortly.";
    if (supplyOnChain === 0)
      return "Purchase unavailable — no DHB supply on this chain.";
    if (typeof supplyOnChain === "number" && netTokens > supplyOnChain) {
      return `Insufficient DHB supply on this chain.`;
    }
    return null;
  }, [parsedAmount, computedPrice, supplyOnChain, netTokens]);

  const onChangeAmount = React.useCallback((txt: string) => {
    // allow only numbers and decimal
    const clean = txt.replace(/[^0-9.]/g, "");
    setAmountUsd(clean);
  }, []);

  const onChangeCurrency = React.useCallback((val: string) => {
    setCurrency(val);
  }, []);

  const onChangeChain = React.useCallback((val: string) => {
    setChain(val);
  }, []);

  const fetchPrice = React.useCallback(async () => {
    const amt = parseFloat(amountUsd || "0");
    if (!Number.isFinite(amt) || amt <= 0) {
      setTokenPrice(null);
      return;
    }
    try {
      setLoadingPrice(true);
      // Prefer screen-provided fetch (lifted to DpayScreen), fallback to local service call
      let price: number | null = null;
      if (onRequestPriceRef.current) {
        try {
          const fetched = await onRequestPriceRef.current({
            currency,
            amount: amt,
            tokenSymbol,
            chainId: Number(chain),
          });
          if (typeof fetched === "number") price = fetched;
        } catch {}
      }
      if (price == null) {
        const res: any = await getDpayPrice({
          currency,
          tokenSymbol,
          amount: amt,
          chainId: Number(chain),
        });
        const data = res?.data ?? res?.result ?? res;
        price = Number(data?.price ?? data?.tokenPrice ?? data?.value ?? 0);
      }
      setTokenPrice(
        Number.isFinite(price as number) && (price as number) > 0
          ? (price as number)
          : null
      );
    } catch (e) {
      setTokenPrice(null);
      // Silent failure here to avoid spam; users will see "Loading..."
    } finally {
      setLoadingPrice(false);
    }
  }, [amountUsd, currency, chain]);

  const debouncedFetchPrice = useDebounceCallback(fetchPrice, 400);

  React.useEffect(() => {
    debouncedFetchPrice();
  }, [debouncedFetchPrice, amountUsd, currency, chain]);

  React.useEffect(() => {
    // seed initial price from prop
    if (typeof initialPrice === "number") setTokenPrice(initialPrice);
  }, [initialPrice]);

  const onOpenConfirm = React.useCallback(() => {
    if (amountValidationError) {
      toastError(amountValidationError);
      return;
    }
    if (!address) {
      toastError("Please connect to Wallet");
      return;
    }
    setConfirmOpen(true);
  }, [address, amountValidationError]);

  const onCloseConfirm = React.useCallback(() => {
    setConfirmOpen(false);
    // Reset checkout/status flow so next attempt starts fresh
    setStatusVisible(false);
    setStatusSid(null);
    setLoadingCheckout(false);
    setTermsAccepted(false);
  }, []);

  const toggleTerms = React.useCallback(() => {
    setTermsAccepted((v) => {
      const next = !v;
      return next;
    });
  }, []);

  const onBuyNow = React.useCallback(() => {
    onOpenConfirm();
  }, [onOpenConfirm]);

  const onConfirmCheckout = React.useCallback(async () => {
    if (!address) {
      toastError("Please connect to Wallet");
      return;
    }
    if (!termsAccepted) {
      toastError("Please accept the Terms and Service");
      return;
    }
    const amt = parseFloat(amountUsd || "0");
    const price =
      typeof tokenPrice === "number"
        ? tokenPrice
        : typeof priceUsd === "number"
        ? priceUsd
        : 0;
    if (
      !Number.isFinite(amt) ||
      amt <= 0 ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      toastError("Enter a valid amount");
      return;
    }
    // Supply checks
    try {
      const chainSupplyRoot =
        supplyData?.[String(chain)] ||
        supplyData?.[Number(chain) as any] ||
        supplyData;
      const chainSupplyMap: Record<string, number> | undefined =
        (chainSupplyRoot && (chainSupplyRoot as any)[String(chain)]) ||
        (chainSupplyRoot && (chainSupplyRoot as any)[Number(chain) as any]) ||
        (typeof chainSupplyRoot === "object"
          ? (chainSupplyRoot as any)
          : undefined);
      const supplyOnChain = chainSupplyMap
        ? chainSupplyMap["DHB"] ?? chainSupplyMap["dhb"] ?? 0
        : 0;
      const gross = amt / price;
      const net = gross - gross * 0.1;
      if (supplyOnChain === 0) {
        toastError(
          `Purchase unavailable — no ${tokenSymbol} supply on this chain.`
        );
        return;
      }
      if (supplyOnChain <= net) {
        toastError(
          `Insufficient ${tokenSymbol} supply: only ${supplyOnChain} available on this chain.`
        );
        return;
      }
    } catch {}

    setLoadingCheckout(true);
    try {
      const gross =
        parseFloat(amountUsd || "0") / (tokenPrice || priceUsd || 1);
      const tokensToReceive = gross - gross * 0.1;

      const payload = {
        chainId: Number(chain),
        address,
        receiverAddress: address,
        amount: parseFloat(amountUsd || "0"),
        tokensToReceive,
        tokenSymbol,
        currency,
        redirect: `${appScheme}://dpay-result`,
        termsAndServicesAccepted: termsAccepted,
      } as const;


      const res: any = await dpayCreateOrder(payload);
      const data = res?.data ?? res?.result ?? res ?? {};
      const sessionId: string | undefined = data?.sessionId || data?.id;
      const redirectUrl: string | undefined =
        data?.url || data?.redirectUrl || data?.checkoutUrl;

      // Keep modal open and show status component; seed with sessionId if present
      if (sessionId) setStatusSid(sessionId);
      if (redirectUrl) {
        await openInApp(redirectUrl);
        toastSuccess("Redirecting to checkout…");
      } else if (sessionId) {
        // Fallback: use website to handle Stripe redirect by sessionId
        const url = `${LEGACY_WEBSITE_LINK}/dpay/checkout?sessionId=${encodeURIComponent(
          sessionId
        )}`;
        await openInApp(url);
        toastSuccess("Opening checkout…");
      } else {
        toastError("Checkout link unavailable. Please try again.");
      }

      setStatusVisible(true);
    } catch (e) {
      toastError(e, "Something went wrong");
    } finally {
      setLoadingCheckout(false);
      // Do not close modal; await deep link and polling
    }
  }, [
    address,
    termsAccepted,
    amountUsd,
    tokenPrice,
    priceUsd,
    chain,
    currency,
  ]);

  return (
    <View className="bg-theme-neutrals-800 rounded-xl p-5 border border-theme-neutrals-700/60">
      <Text className="text-white text-xl font-semibold mb-1">Top Up</Text>
      <Text className="text-gray-300 text-[11px] mb-4">
        Buy $DHB using card and get free gas to use instantly
      </Text>

      <View className="mb-3">
        <Text className="text-gray-400 text-[11px] mb-1">Select Currency</Text>
        <Dropdown
          value={currency}
          onChange={onChangeCurrency}
          placeholder="Choose currency"
          options={currencyOptions}
        />
        <View className="flex-row items-center justify-between mt-2">
          <Text className="text-gray-400 text-[11px]">Current DHB Price</Text>
          <Text className="text-white text-sm tracking-wide">
            {typeof tokenPrice === "number"
              ? `${tokenPrice.toFixed(7)} ${currency.toUpperCase()}`
              : loadingPrice
              ? "Loading..."
              : priceUsd
              ? `${priceUsd.toFixed?.(7) ?? priceUsd} ${currency.toUpperCase()}`
              : "—"}
          </Text>
        </View>
      </View>

      <View className="mb-3">
        <Text className="text-gray-400 text-[11px] mb-1">
          Amount [{currency.toUpperCase()}]
        </Text>
        <View className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 flex-row items-center">
          <Ionicons name="cash-outline" size={16} color="#9CA3AF" />
          <TextInput
            value={amountUsd}
            onChangeText={onChangeAmount}
            keyboardType="decimal-pad"
            placeholder="10"
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-white text-base ml-2"
          />
        </View>
        {amountValidationError ? (
          <Text className="text-red-400 text-[11px] mt-1">
            {amountValidationError}
          </Text>
        ) : null}
      </View>

      <View className="mb-3">
        <Text className="text-gray-400 text-[11px] mb-1">Wallet Address</Text>
        <View className="h-11 px-3 rounded-lg bg-zinc-900 border border-zinc-800 flex-row items-center">
          <Ionicons name="wallet-outline" size={16} color="#9CA3AF" />
          <Text className="text-white text-sm ml-2">
            {miniAddress(
              address || "0x0000000000000000000000000000000000000000"
            )}
          </Text>
        </View>
      </View>

      <View className="mb-3">
        <Text className="text-gray-400 text-[11px] mb-1">Select Chain</Text>
        <Dropdown
          value={chain}
          onChange={onChangeChain}
          placeholder="Choose chain"
          options={chainOptions}
        />
      </View>

      <View className="flex-row items-center mb-4">
        <Ionicons name="receipt-outline" size={14} color="#9CA3AF" />
        <Text className="text-gray-300 text-[11px] ml-2">
          You’ll receive approximately{" "}
          <Text className="text-white font-semibold">
            {approxReceive} DEHUB
          </Text>
        </Text>
      </View>

      <AccentButtonGradient>
        <TouchableOpacity
          onPress={onBuyNow}
          disabled={
            loadingCheckout || !!amountValidationError || !address || loadingPrice
          }
          activeOpacity={0.8}
          className={`py-3 rounded-xl items-center ${
            loadingCheckout || !!amountValidationError || !address || loadingPrice
              ? "opacity-50"
              : ""
          }`}
        >
          <Text className="text-white font-semibold">
            {loadingCheckout ? "Processing..." : "Buy now"}
          </Text>
        </TouchableOpacity>
      </AccentButtonGradient>

      <GlassModal
        visible={confirmOpen}
        onClose={onCloseConfirm}
        presentation="center"
        backdropScope="panel"
      >
        <View className="p-5">
          {!statusVisible ? (
            <>
              <Text className="text-white text-2xl font-semibold text-center mb-4">
                Confirm Purchase
              </Text>

              <View className="border-t border-theme-neutrals-700/60">
                <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
                  <Text className="text-gray-300 text-sm">
                    {currency.toUpperCase()} Amount
                  </Text>
                  <Text className="text-white text-sm font-semibold">
                    {parseFloat(amountUsd || "0").toFixed(2)} [
                    {currency.toUpperCase()}]
                  </Text>
                </View>
                <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
                  <Text className="text-gray-300 text-sm">
                    Approx Receive {tokenSymbol}
                  </Text>
                  <Text className="text-white text-sm font-semibold">
                    {approxReceive}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between py-3 border-b border-theme-neutrals-700/60">
                  <Text className="text-gray-300 text-sm">Wallet Address</Text>
                  <Text className="text-white text-sm font-semibold">
                    {miniAddress(address || "")}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={toggleTerms}
                activeOpacity={0.9}
                className="flex-row items-center mt-4"
              >
                <Ionicons
                  name={termsAccepted ? "checkbox" : "square-outline"}
                  size={18}
                  color={termsAccepted ? theme.colors.accent : "#9CA3AF"}
                />
                <Text className="text-gray-300 text-xs ml-2">
                  I accept the{" "}
                  <Text
                    onPress={() => openInApp(TERMS_OF_SERVICE_LINK)}
                    className="text-blue-400 font-semibold"
                  >
                    Terms and Service
                  </Text>
                </Text>
              </TouchableOpacity>

              <View className="flex-row mt-5">
                <View className="flex-1 mr-2">
                  <TouchableOpacity
                    onPress={onCloseConfirm}
                    activeOpacity={0.9}
                    className="rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 py-3 items-center"
                  >
                    <Text className="text-white text-sm font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-1 ml-2">
                  <PrimaryButton
                    title={loadingCheckout ? "Processing..." : "Confirm & Pay"}
                    onPress={onConfirmCheckout}
                    disabled={loadingCheckout}
                  />
                </View>
              </View>
            </>
          ) : (
            <DpayCheckoutStatus
              address={address as string}
              chainId={Number(chain)}
              tokenSymbol={tokenSymbol}
              initialSid={statusSid}
              onClose={onCloseConfirm}
            />
          )}
        </View>
      </GlassModal>
    </View>
  );
};

export default DpayTopUpForm;
