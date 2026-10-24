import React from "react";
import SvgArtworkDownload from "./SvgArtworkDownload";
import { useTranslation } from "react-i18next";
import { gradientSvgDocument } from "../../libs/editor/gradientSvgDocument";
import { validGradientFill, type GradientFill } from "../../libs/editor/gradientFill";
export default function GradientVectorDownload({ value, width, height, title }: { value: GradientFill; width: number; height: number; title: string }) {
  const { t } = useTranslation();
  return <SvgArtworkDownload title={title} suffix="-gradient" disabled={!validGradientFill(value)} getSvg={() => gradientSvgDocument(value, width, height)} label={t("editor.gradients.downloadSvg", { defaultValue: "Download gradient as SVG" })} hint={t("editor.gradients.svgHint", { defaultValue: "Exports this gradient at the page size, including stop positions and transparency. Apply it separately to use it in the design." })} />;
}
