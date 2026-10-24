import React from "react";
import { useTranslation } from "react-i18next";
import SvgArtworkDownload from "./SvgArtworkDownload";
import { qrSvgDocument } from "../../libs/editor/qrSvgDocument";
import type { QrGraphic } from "../../libs/editor/qrGraphic";
export default function QrVectorDownload({ value, title }: { value: QrGraphic | null; title: string }) { const { t } = useTranslation(); return <SvgArtworkDownload disabled={!value} getSvg={() => { if (!value) throw new Error("Create a QR code first"); return qrSvgDocument(value); }} title={title} suffix="-qr" label={t("editor.qr.downloadSvg", { defaultValue: "Download QR as SVG" })} hint={t("editor.qr.vectorHint", { defaultValue: "Exports the current QR draft with its colours and quiet zone as scalable vector artwork." })} />; }
