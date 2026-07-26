/**
 * MyStoreTab
 * ==========
 * Native port of the web MyStoreTab + SetupStoreFlow + CreateListingDrawer.
 * Seller dashboard: create/edit a store, create listings with image upload,
 * archive / mark-sold, and work through incoming orders.
 *
 * Same Supabase tables and same `store-media` bucket as web — images are picked
 * with expo-image-picker and uploaded via `uploadStoreMedia` (fetch → Blob),
 * since React Native has no File object.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { runWithPermissions } from "../../libs/permissions.util";
import { toastError, toastSuccess } from "../../libs/toast";
import {
  useMyStores,
  useMyListings,
  useMyOrders,
  useCreateStore,
  useUpdateStore,
  useCreateListing,
  useUpdateListing,
  useUpdateOrderStatus,
  uploadStoreMedia,
  type Store,
  type StoreListing,
  type StoreOrder,
} from "../../hooks/useStores";

type SubTab = "listings" | "orders" | "purchases";

const LISTING_CATEGORIES = [
  { value: "digital", label: "Digital" },
  { value: "merch", label: "Merch" },
  { value: "art", label: "Art" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

const CONDITIONS = ["new", "used", "refurbished"];
const MAX_IMAGES = 5;

function money(n: number): string {
  const v = Number(n) || 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function pickImage(): Promise<string | null> {
  let uri: string | null = null;
  await runWithPermissions(["photos"], async () => {
    const mediaTypesCompat: any = (ImagePicker as any).MediaType
      ? [(ImagePicker as any).MediaType.image]
      : ImagePicker.MediaTypeOptions.Images;
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaTypesCompat,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!pick.canceled && pick.assets?.[0]?.uri) uri = pick.assets[0].uri;
  });
  return uri;
}

// ── Store setup / edit ──────────────────────────────────────────────────────

const StoreForm: React.FC<{
  visible: boolean;
  existing?: Store | null;
  onClose: () => void;
}> = ({ visible, existing, onClose }) => {
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(existing?.avatar_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(existing?.banner_url ?? "");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  // Re-seed when the sheet opens for a different store
  React.useEffect(() => {
    if (!visible) return;
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setAvatarUrl(existing?.avatar_url ?? "");
    setBannerUrl(existing?.banner_url ?? "");
  }, [visible, existing]);

  const upload = useCallback(async (which: "avatar" | "banner") => {
    const uri = await pickImage();
    if (!uri) return;
    setUploading(which);
    try {
      const url = await uploadStoreMedia(uri, "stores");
      if (which === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (e: any) {
      toastError(e, "Upload failed");
    } finally {
      setUploading(null);
    }
  }, []);

  const busy = createStore.isPending || updateStore.isPending || !!uploading;

  const submit = useCallback(() => {
    if (!name.trim()) return;
    if (existing) {
      updateStore.mutate(
        {
          id: existing.id,
          name: name.trim(),
          description: description.trim(),
          avatar_url: avatarUrl || undefined,
          banner_url: bannerUrl || undefined,
        },
        { onSuccess: onClose },
      );
    } else {
      createStore.mutate(
        {
          name: name.trim(),
          description: description.trim(),
          avatar_url: avatarUrl || undefined,
          banner_url: bannerUrl || undefined,
        },
        { onSuccess: onClose },
      );
    }
  }, [name, description, avatarUrl, bannerUrl, existing, createStore, updateStore, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{existing ? "Edit store" : "Create your store"}</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Icon name="X" size={20} color="#A1A1AA" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Pressable style={styles.bannerPick} onPress={() => upload("banner")}>
                {bannerUrl ? (
                  <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : null}
                <View style={styles.pickOverlay}>
                  {uploading === "banner" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Icon name="ImagePlus" size={18} color="#FFFFFF" />
                      <Text style={styles.pickText}>Banner</Text>
                    </>
                  )}
                </View>
              </Pressable>

              <Pressable style={styles.avatarPick} onPress={() => upload("avatar")}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : null}
                <View style={styles.pickOverlay}>
                  {uploading === "avatar" ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Icon name="ImagePlus" size={16} color="#FFFFFF" />
                  )}
                </View>
              </Pressable>

              <Text style={styles.label}>Store name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="My Store"
                placeholderTextColor="#52525B"
                style={styles.input}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What do you sell?"
                placeholderTextColor="#52525B"
                multiline
                style={[styles.input, styles.textarea]}
              />
            </ScrollView>

            <Pressable
              onPress={submit}
              disabled={!name.trim() || busy}
              style={[styles.primaryBtn, (!name.trim() || busy) && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {existing ? "Save changes" : "Create store"}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ── Listing form ────────────────────────────────────────────────────────────

const ListingForm: React.FC<{
  visible: boolean;
  storeId: string;
  onClose: () => void;
}> = ({ visible, storeId, onClose }) => {
  const createListing = useCreateListing();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  const [condition, setCondition] = useState("new");
  const [isDigital, setIsDigital] = useState(false);
  const [shippingInfo, setShippingInfo] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPrice("");
    setCategory("other");
    setCondition("new");
    setIsDigital(false);
    setShippingInfo("");
    setStockQty("");
    setImages([]);
  }, []);

  const addImage = useCallback(async () => {
    if (images.length >= MAX_IMAGES) return;
    const uri = await pickImage();
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadStoreMedia(uri, "listings");
      setImages((prev) => [...prev, url]);
    } catch (e: any) {
      toastError(e, "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [images.length]);

  const submit = useCallback(() => {
    if (!title.trim() || !price) {
      toastError("Title and price are required");
      return;
    }
    createListing.mutate(
      {
        store_id: storeId,
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        category,
        images,
        stock_quantity: stockQty ? Number(stockQty) : null,
        is_digital: isDigital,
        condition,
        shipping_info: shippingInfo.trim() || undefined,
        status: "active",
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }, [
    title,
    price,
    description,
    category,
    images,
    stockQty,
    isDigital,
    condition,
    shippingInfo,
    storeId,
    createListing,
    reset,
    onClose,
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New listing</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Icon name="X" size={20} color="#A1A1AA" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Images */}
              <Text style={styles.label}>Photos ({images.length}/{MAX_IMAGES})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {images.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.thumb}>
                      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <Pressable
                        style={styles.thumbRemove}
                        onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        hitSlop={6}
                      >
                        <Icon name="X" size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <Pressable style={styles.thumbAdd} onPress={addImage} disabled={uploading}>
                      {uploading ? (
                        <ActivityIndicator size="small" color="#A1A1AA" />
                      ) : (
                        <Icon name="ImagePlus" size={20} color="#A1A1AA" />
                      )}
                    </Pressable>
                  )}
                </View>
              </ScrollView>

              <Text style={styles.label}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What are you selling?"
                placeholderTextColor="#52525B"
                style={styles.input}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Condition, details, what's included"
                placeholderTextColor="#52525B"
                multiline
                style={[styles.input, styles.textarea]}
              />

              <Text style={styles.label}>Price (USD)</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor="#52525B"
                keyboardType="decimal-pad"
                style={styles.input}
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.chipWrap}>
                {LISTING_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    style={[styles.chip, category === c.value && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Condition</Text>
              <View style={styles.chipWrap}>
                {CONDITIONS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCondition(c)}
                    style={[styles.chip, condition === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Digital item</Text>
                <Switch
                  value={isDigital}
                  onValueChange={setIsDigital}
                  trackColor={{ false: "#3F3F46", true: "#FFFFFF" }}
                  thumbColor={isDigital ? "#000000" : "#A1A1AA"}
                />
              </View>

              {!isDigital && (
                <>
                  <Text style={styles.label}>Stock quantity (optional)</Text>
                  <TextInput
                    value={stockQty}
                    onChangeText={setStockQty}
                    placeholder="Leave blank for unlimited"
                    placeholderTextColor="#52525B"
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                  <Text style={styles.label}>Shipping info (optional)</Text>
                  <TextInput
                    value={shippingInfo}
                    onChangeText={setShippingInfo}
                    placeholder="Ships worldwide, 3–5 days"
                    placeholderTextColor="#52525B"
                    style={styles.input}
                  />
                </>
              )}
            </ScrollView>

            <Pressable
              onPress={submit}
              disabled={createListing.isPending || uploading}
              style={[
                styles.primaryBtn,
                (createListing.isPending || uploading) && styles.disabled,
              ]}
            >
              {createListing.isPending ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.primaryBtnText}>Publish listing</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ── Tab ─────────────────────────────────────────────────────────────────────

const MyStoreTab: React.FC<{ isAuthed: boolean; onSignIn: () => void }> = ({
  isAuthed,
  onSignIn,
}) => {
  const { data: stores = [], isLoading: loadingStores } = useMyStores();
  const { data: listings = [] } = useMyListings();
  const sellerOrders = useMyOrders("seller");
  const buyerOrders = useMyOrders("buyer");
  const updateListing = useUpdateListing();
  const updateOrderStatus = useUpdateOrderStatus();

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("listings");
  const [storeFormOpen, setStoreFormOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [listingFormOpen, setListingFormOpen] = useState(false);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) || stores[0] || null,
    [stores, selectedStoreId],
  );
  const storeListings = useMemo(
    () => (activeStore ? listings.filter((l) => l.store_id === activeStore.id) : listings),
    [listings, activeStore],
  );

  const archive = useCallback(
    (id: string) =>
      updateListing.mutate(
        { id, status: "archived" },
        { onSuccess: () => toastSuccess("Listing archived") },
      ),
    [updateListing],
  );
  const markSold = useCallback(
    (id: string) =>
      updateListing.mutate(
        { id, status: "sold" },
        { onSuccess: () => toastSuccess("Marked as sold") },
      ),
    [updateListing],
  );

  const listingMenu = useCallback(
    (l: StoreListing) => {
      Alert.alert(l.title, undefined, [
        { text: "Archive", onPress: () => archive(l.id) },
        { text: "Mark as sold", onPress: () => markSold(l.id) },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [archive, markSold],
  );

  const advanceOrder = useCallback(
    (o: StoreOrder) => {
      const next = o.status === "pending" ? "shipped" : "completed";
      Alert.alert(`Mark as ${next}?`, undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () =>
            updateOrderStatus.mutate(
              { id: o.id, status: next },
              { onSuccess: () => toastSuccess(`Order marked ${next}`) },
            ),
        },
      ]);
    },
    [updateOrderStatus],
  );

  if (!isAuthed) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Sign in to manage your store</Text>
        <Pressable onPress={onSignIn} style={[styles.primaryBtn, { marginTop: 14 }]}>
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (loadingStores) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // No store yet — web drops straight into the setup flow.
  if (stores.length === 0) {
    return (
      <View style={styles.center}>
        <Icon name="Store" size={44} color="#3F3F46" />
        <Text style={styles.emptyTitle}>Open your store</Text>
        <Text style={styles.dim}>List digital goods, merch, art or services.</Text>
        <Pressable
          onPress={() => {
            setEditingStore(null);
            setStoreFormOpen(true);
          }}
          style={[styles.primaryBtn, { marginTop: 16 }]}
        >
          <Text style={styles.primaryBtnText}>Create store</Text>
        </Pressable>
        <StoreForm visible={storeFormOpen} onClose={() => setStoreFormOpen(false)} />
      </View>
    );
  }

  const TABS: { key: SubTab; label: string; count: number }[] = [
    { key: "listings", label: "Listings", count: storeListings.length },
    { key: "orders", label: "Orders", count: sellerOrders.data?.length ?? 0 },
    { key: "purchases", label: "Purchases", count: buyerOrders.data?.length ?? 0 },
  ];

  const orders = subTab === "orders" ? sellerOrders.data ?? [] : buyerOrders.data ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Store header */}
      <View style={styles.storeHeader}>
        {!!activeStore?.banner_url && (
          <Image
            source={{ uri: activeStore.banner_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
        <View style={styles.storeHeaderScrim} />
        <View style={styles.storeHeaderRow}>
          <Avatar
            uri={activeStore?.avatar_url ?? undefined}
            size={48}
            rounded
            name={activeStore?.name || "Store"}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.storeName} numberOfLines={1}>
              {activeStore?.name}
            </Text>
            <Text style={styles.storeMeta} numberOfLines={1}>
              {storeListings.length} {storeListings.length === 1 ? "listing" : "listings"}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setEditingStore(activeStore);
              setStoreFormOpen(true);
            }}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Icon name="Settings" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Store switcher when there's more than one */}
      {stores.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {stores.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setSelectedStoreId(s.id)}
                style={[styles.chip, activeStore?.id === s.id && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, activeStore?.id === s.id && styles.chipTextActive]}
                >
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => setListingFormOpen(true)}
          style={[styles.primaryBtn, { flex: 1 }]}
        >
          <Text style={styles.primaryBtnText}>New listing</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setEditingStore(null);
            setStoreFormOpen(true);
          }}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>New store</Text>
        </Pressable>
      </View>

      {/* Sub tabs */}
      <View style={styles.segment}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setSubTab(t.key)}
            style={[styles.segmentBtn, subTab === t.key && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, subTab === t.key && styles.segmentTextActive]}>
              {t.label} ({t.count})
            </Text>
          </Pressable>
        ))}
      </View>

      {subTab === "listings" ? (
        storeListings.length === 0 ? (
          <Text style={[styles.dim, { textAlign: "center", paddingVertical: 30 }]}>
            No listings yet
          </Text>
        ) : (
          storeListings.map((l) => {
            const imgs = Array.isArray(l.images) ? l.images : [];
            return (
              <View key={l.id} style={styles.row}>
                <View style={styles.rowThumb}>
                  {imgs[0] ? (
                    <Image source={{ uri: imgs[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Icon name="Package" size={16} color="#3F3F46" />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {money(l.price)} · {l.status}
                  </Text>
                </View>
                <Pressable onPress={() => listingMenu(l)} hitSlop={8}>
                  <Icon name="EllipsisVertical" size={16} color="#A1A1AA" />
                </Pressable>
              </View>
            );
          })
        )
      ) : orders.length === 0 ? (
        <Text style={[styles.dim, { textAlign: "center", paddingVertical: 30 }]}>
          {subTab === "orders" ? "No orders yet" : "No purchases yet"}
        </Text>
      ) : (
        orders.map((o) => {
          const imgs = o.store_listings?.images;
          const img = Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : null;
          const canAdvance = subTab === "orders" && o.status !== "completed";
          return (
            <Pressable
              key={o.id}
              style={styles.row}
              onPress={canAdvance ? () => advanceOrder(o) : undefined}
              disabled={!canAdvance}
            >
              <View style={styles.rowThumb}>
                {img ? (
                  <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Icon name="Package" size={16} color="#3F3F46" />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {o.store_listings?.title ?? "Listing removed"}
                </Text>
                <Text style={styles.rowMeta}>
                  {money(o.amount)} · {o.status}
                </Text>
              </View>
              {canAdvance && <Icon name="ChevronRight" size={16} color="#52525B" />}
            </Pressable>
          );
        })
      )}

      <StoreForm
        visible={storeFormOpen}
        existing={editingStore}
        onClose={() => {
          setStoreFormOpen(false);
          setEditingStore(null);
        }}
      />
      {!!activeStore && (
        <ListingForm
          visible={listingFormOpen}
          storeId={activeStore.id}
          onClose={() => setListingFormOpen(false)}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  dim: { color: "#71717A", fontSize: 13, textAlign: "center", marginTop: 6 },
  emptyTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", marginTop: 12 },

  storeHeader: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  storeHeaderScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  storeHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  storeName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  storeMeta: { color: "#A1A1AA", fontSize: 11.5, marginTop: 2 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  segment: {
    flexDirection: "row",
    gap: 4,
    marginTop: 12,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  segmentText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  rowThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  rowMeta: { color: "#71717A", fontSize: 11.5, marginTop: 3, textTransform: "capitalize" },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0A0A0A",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "90%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },

  bannerPick: {
    width: "100%",
    height: 96,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  avatarPick: {
    width: 64,
    height: 64,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 6,
  },
  pickOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pickText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },

  label: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  textarea: { minHeight: 84, textAlignVertical: "top" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  chipTextActive: { color: "#000000" },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  switchLabel: { color: "#E4E4E7", fontSize: 13.5, fontWeight: "600" },

  thumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0A0A0A",
  },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.70)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbAdd: {
    width: 76,
    height: 76,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  primaryBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  secondaryBtnText: { color: "#E4E4E7", fontSize: 14, fontWeight: "600" },
  disabled: { opacity: 0.4 },
});

export default MyStoreTab;
