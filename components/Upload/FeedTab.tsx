import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import BasicInfoForm from "./BasicInfoForm";
import UploadCategoriesSelector from "./UploadCategoriesSelector";
import ConfirmUploadModal from "./ConfirmUploadModal";
import { getCategoriesCached, minNft } from "../../services/nft.service";
import { getFileName, guessMime } from "../../libs/assets.util";
import {
  ensureMediaLibraryPermission,
  waitAfterPermissionIfNeeded,
} from "../../libs/permissions.util";
import { toastError, toastSuccess } from "../../libs/toast";
import { useAuth } from "../../context/AuthContext";
import {
  useWeb3Provider,
  useStreamCollectionContract,
} from "../../hooks/use-web3";
import { mintNftOnChain } from "../../services/mint.service";
import { parseTxError } from "../../libs/web3.util";
import { getOrCreateAuthSignature } from "../../libs/web3.auth.sign";
import { web3AuthService } from "../../services/web3auth.service";

type PickedImage = ImagePicker.ImagePickerAsset;

export default function FeedTab() {
  const DESCRIPTION_MAX = 500;
  const CATEGORIES_MIN = 1;
  const CATEGORIES_MAX = 5;

  const navigation = useNavigation();
  const { user, tokenBalances, isSignedIn, authMethod } = (useAuth() as any) || {};
  const { chainId } = useWeb3Provider();
  const streamCollectionContract = useStreamCollectionContract();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Images (0-4)
  const [images, setImages] = useState<PickedImage[]>([]);

  // Upload state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    | "idle"
    | "uploading"
    | "processing"
    | "awaiting-wallet"
    | "minting"
    | "finalizing"
  >("idle");

  // Derive ETH balance from auth state (used for gas checks)
  const ethBalance = useMemo(() => {
    const b: unknown = (user?.tokenBalances?.ETH ?? tokenBalances?.ETH) as any;
    const n = typeof b === "string" ? Number(b) : typeof b === "number" ? b : 0;
    return Number.isFinite(n) ? n : 0;
  }, [user?.tokenBalances?.ETH, tokenBalances?.ETH]);

  // Categories load (cached)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCategoriesCached();
        if (mounted) setAllCategories(data);
      } catch (e) {
        console.warn("[FeedTab] Failed to load categories", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const addCategory = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      if (categories.find((c) => c.toLowerCase() === n.toLowerCase())) return;
      if (categories.length >= CATEGORIES_MAX) return;
      setCategories((prev) => [...prev, n]);
      setCategoryQuery("");
      setCategoryOpen(false);
    },
    [categories]
  );

  const removeCategory = useCallback((name: string) => {
    setCategories((prev) =>
      prev.filter((c) => c.toLowerCase() !== name.toLowerCase())
    );
  }, []);

  const isFormValid = useMemo(() => {
    const t = title.trim();
    const d = description.trim();
    const hasBasics =
      t.length >= 3 && d.length >= 3 && categories.length >= CATEGORIES_MIN;
    // Images are optional (0-4)
    const withinLimit = images.length <= 4;
    return hasBasics && withinLimit;
  }, [title, description, categories.length, images.length]);

  const pickImages = useCallback(async () => {
    const perm = await ensureMediaLibraryPermission();
    if (!perm.granted) {
      toastError("Permission to access photos is required.");
      return;
    }
    await waitAfterPermissionIfNeeded(perm.justGranted);
    const remaining = Math.max(0, 4 - images.length);
    if (remaining <= 0) return;
    const supportsMulti =
      !!(ImagePicker as any).launchImageLibraryAsync &&
      (ImagePicker as any).MediaTypeOptions?.Images != null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    } as any);
    if (!res.canceled && res.assets?.length) {
      const picked = res.assets.slice(0, remaining);
      setImages((prev) => [...prev, ...picked]);
    }
  }, [images.length]);

  const removeImageAt = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const buildFormData = useCallback(async () => {
    const addr = (user?.walletAddress || user?.address || "").toLowerCase();
    const formData = new FormData();
    formData.append("name", title.trim());
    formData.append("description", description.trim());
    // Feed post types: feed-images (with images) or feed-simple (no images)
    if (images.length > 0) {
      formData.append("postType", "feed-images");
      images.forEach((img) => {
        if (!img?.uri) return;
        const name = getFileName(img.uri, "image.jpg");
        const type = guessMime(img.uri, "image/jpeg");
        // @ts-ignore React Native FormData file shape
        formData.append("feed-images", { uri: img.uri, name, type } as any);
      });
    } else {
      formData.append("postType", "feed-simple");
    }
    formData.append("chainId", String(chainId ?? ""));
    formData.append("category", JSON.stringify(categories || []));
    // Ensure JSON fields expected by backend are present
    formData.append("streamInfo", JSON.stringify({}));
    formData.append("plans", JSON.stringify([]));
    // Auth signature fields to match backend
    if (addr) formData.append("address", addr);
    return formData;
  }, [
    title,
    description,
    categories,
    images,
    chainId,
    user?.walletAddress,
    user?.address,
  ]);

  const onUploadPress = useCallback(() => {
    // For imported (local) accounts, require ETH for gas; Web3Auth users are gas sponsored
    if (authMethod === 'local' && ethBalance <= 0) {
      toastError("Gas sponsorship isn't available for imported accounts. Please deposit ETH for gas and try again.");
      return;
    }
    if (!isFormValid) return;
    setConfirmText(
      "Are you sure the details are correct and you wish to proceed? Feed uploads are on-chain and immutable."
    );
    setShowConfirm(true);
  }, [ethBalance, isFormValid, authMethod]);

  const handleUpload = useCallback(async () => {
    try {
      setIsUploading(true);
      setUploadStage("uploading");
      const formData = await buildFormData();
      const res = await minNft(formData as any);
      setUploadStage("processing");
      const result: any = (res as any)?.data ?? res;
      if (result?.error) {
        throw new Error(
          result?.error_msg || result?.msg || "Mint prepare failed"
        );
      }
      const createdTokenId = result?.createdTokenId;
      const timestamp = result?.timestamp;
      const v = result?.v;
      const r = result?.r;
      const s = result?.s;
      if (
        createdTokenId == null ||
        timestamp == null ||
        v == null ||
        !r ||
        !s
      ) {
        throw new Error("Mint signature payload missing");
      }
      if (!streamCollectionContract)
        throw new Error("Wallet not ready to mint");
      setUploadStage("awaiting-wallet");
      // console.log({        streamCollectionContract,
      //   createdTokenId,
      //   timestamp,
      //   v,
      //   r,
      //   s})
      const tx = await mintNftOnChain(
        streamCollectionContract,
        createdTokenId,
        timestamp,
        v,
        r,
        s
      );
      setUploadStage("minting");
      await tx?.wait?.(1);
      setShowConfirm(false);
      setUploadStage("finalizing");
      toastSuccess("Posted!", {
        description: "Your feed post is live. It may take a moment to appear.",
      });
      setUploadStage("idle");
      setIsUploading(false);
      try {
        (navigation as any).navigate?.(
          ScreenNames.FeedDetail as never,
          { tokenId: result?.createdTokenId } as never
        );
      } catch {}
    } catch (e: any) {
      console.error("Minting error:", e);
      const inMintPhase = ["awaiting-wallet", "minting", "finalizing"].includes(
        uploadStage
      );
      const msg = inMintPhase
        ? parseTxError(e, "send")
        : e?.message || "Upload failed";
      toastError(msg);
    } finally {
      setIsUploading(false);
      setUploadStage("idle");
    }
  }, [buildFormData, streamCollectionContract, uploadStage, navigation]);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <BasicInfoForm
          title={title}
          description={description}
          descriptionMax={DESCRIPTION_MAX}
          descriptionPlaceholder="Share what your post is about"
          onChangeTitle={setTitle}
          onChangeDescription={setDescription}
        />

        <UploadCategoriesSelector
          categories={categories}
          allCategories={allCategories}
          categoryQuery={categoryQuery}
          setCategoryQuery={setCategoryQuery}
          open={categoryOpen}
          setOpen={setCategoryOpen}
          min={CATEGORIES_MIN}
          max={CATEGORIES_MAX}
          onAdd={addCategory}
          onRemove={removeCategory}
        />

        {/* Images picker */}
        <View className="mt-4">
          <Text className="text-gray-400 mb-1">Images (optional, up to 4)</Text>
          {images.length === 0 ? (
            <TouchableOpacity
              onPress={pickImages}
              activeOpacity={0.9}
              className="h-28 rounded-xl border border-zinc-800 bg-zinc-900 items-center justify-center"
            >
              <View className="flex-row items-center">
                <Ionicons name="image-outline" size={20} color="#9CA3AF" />
                <Text className="ml-2 text-gray-300 font-semibold">
                  Pick images
                </Text>
              </View>
              <Text className="text-gray-500 mt-1 text-xs">
                Tap to open your library
              </Text>
            </TouchableOpacity>
          ) : (
            <View className="rounded-xl border border-zinc-800 p-3 bg-zinc-900">
              <View className="flex-row flex-wrap -m-1">
                {images.map((img, idx) => (
                  <View
                    key={`${img.assetId || img.uri}-${idx}`}
                    className="w-1/2 p-1"
                  >
                    <View className="rounded-lg overflow-hidden border border-zinc-800">
                      <Image
                        source={{ uri: img.uri }}
                        className="w-full h-32"
                        resizeMode="cover"
                      />
                      <View className="absolute top-2 right-2">
                        <TouchableOpacity
                          onPress={() => removeImageAt(idx)}
                          className="w-8 h-8 rounded-full items-center justify-center bg-black/60 border border-zinc-700"
                          accessibilityLabel="Remove image"
                        >
                          <Ionicons name="trash" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                {images.length < 4 && (
                  <View className="w-1/2 p-1">
                    <TouchableOpacity
                      onPress={pickImages}
                      className="h-32 rounded-lg border border-dashed border-zinc-700 bg-zinc-900 items-center justify-center"
                    >
                      <Ionicons name="add" size={22} color="#9CA3AF" />
                      <Text className="text-gray-400 text-xs mt-1">
                        Add more
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View className="px-4 pt-2 pb-6 mb-6">
        <AccentButtonGradient>
          <TouchableOpacity
            disabled={isSignedIn ? !isFormValid : false}
            onPress={onUploadPress}
            className="h-12 rounded-xl items-center justify-center"
            style={{ backgroundColor: 'transparent' }}
          >
            <Text className="text-white font-semibold">
              {isSignedIn
                ? isFormValid
                  ? "Post"
                  : "Complete form to post"
                : "Sign in to post"}
            </Text>
          </TouchableOpacity>
        </AccentButtonGradient>
      </View>

      <ConfirmUploadModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleUpload}
        confirmText={confirmText}
        stage={uploadStage}
        variant="default"
      />
    </View>
  );
}
