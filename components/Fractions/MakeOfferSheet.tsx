/**
 * Bid on fractions of a post.
 *
 * An offer is unfunded — nothing moves until a holder accepts, sends the
 * fractions, and the buyer is asked to pay. Aimed at the listing's seller when
 * it is opened from a listing, so it lands in their "offers for your
 * fractions" rather than in every holder's.
 */
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { DhbCoin } from "../common/DhbCoin";
import { FractionSheet, NumberField, Panel, PanelRow, PrimaryButton, sheetStyles } from "./SheetParts";
import { fmt } from "./fractionFormat";
import { toastError, toastSuccess } from "../../libs/toast";
import { TOTAL_FRACTIONS, useCreateOffer, useFractionWallet } from "../../hooks/useFractionMarket";

export interface OfferTarget {
  tokenId: string;
  chainId: number;
  targetSeller?: string;
  listingId?: string;
  title?: string | null;
}

interface Props {
  target: OfferTarget | null;
  onClose: () => void;
}

const MakeOfferSheet: React.FC<Props> = ({ target, onClose }) => {
  const { t } = useTranslation();
  const wallet = useFractionWallet();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const createOffer = useCreateOffer();

  useEffect(() => {
    setQuantity("");
    setPrice("");
  }, [target?.tokenId, target?.listingId]);

  if (!target) return null;

  const qty = Math.min(TOTAL_FRACTIONS, parseInt(quantity, 10) || 0);
  const prc = parseFloat(price) || 0;
  const isValid = qty > 0 && prc > 0;

  const handleSubmit = async () => {
    if (!wallet) return toastError(null, t("fractions.signInFirst"));
    if (target.targetSeller && target.targetSeller.toLowerCase() === wallet) {
      return toastError(null, t("fractions.cannotOfferOwn"));
    }
    if (!isValid) return;
    try {
      await createOffer.mutateAsync({
        tokenId: target.tokenId,
        quantity: qty,
        pricePerFraction: prc,
        targetSeller: target.targetSeller,
        listingId: target.listingId,
        chainId: target.chainId,
      });
      toastSuccess(t("fractions.offerSubmitted", { count: qty, price: prc }));
      onClose();
    } catch (err) {
      toastError(err, t("fractions.offerSubmitFailed"));
    }
  };

  return (
    <FractionSheet
      visible={!!target}
      onClose={onClose}
      busy={createOffer.isPending}
      title={t("fractions.makeAnOffer")}
    >
      <Text style={sheetStyles.link} numberOfLines={1}>
        {target.title || t("fractions.postNumber", { id: target.tokenId })}
      </Text>
      <NumberField label={t("fractions.numberOfFractions")} value={quantity} onChange={setQuantity} />
      <NumberField
        label={t("fractions.yourOfferLabel")}
        value={price}
        onChange={setPrice}
        decimal
        unit={<DhbCoin size={16} />}
      />
      {isValid && (
        <Panel>
          <PanelRow label={t("fractions.totalOfferValue")}>
            <DhbCoin size={14} />
            <Text style={sheetStyles.valueStrong}>{fmt(qty * prc)}</Text>
          </PanelRow>
        </Panel>
      )}
      <Text style={sheetStyles.footnote}>{t("fractions.offerVisibleNote")}</Text>
      <PrimaryButton
        icon="HandCoins"
        label={createOffer.isPending ? t("fractions.submitting") : t("fractions.submitOffer")}
        onPress={handleSubmit}
        loading={createOffer.isPending}
        disabled={!isValid}
      />
    </FractionSheet>
  );
};

export default MakeOfferSheet;
