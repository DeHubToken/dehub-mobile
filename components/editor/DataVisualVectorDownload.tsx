import React from "react";
import { useTranslation } from "react-i18next";
import SvgArtworkDownload from "./SvgArtworkDownload";
import { requestDataVisualSvg } from "../../libs/editor/dataVisualSvgRenderer";
import type { SvgDataVisual } from "../../libs/editor/dataVisualSvg";
export default function DataVisualVectorDownload({ projectId, value, width, height, title }: { projectId: string; value: SvgDataVisual | null; width: number; height: number; title: string }) {
  const { t } = useTranslation();
  const getSvg = (signal: AbortSignal) => { if (!value) return Promise.reject(new Error("Enter valid data before exporting")); return requestDataVisualSvg(projectId, value, Math.max(32, Math.min(8192, width)), Math.max(32, Math.min(8192, height)), signal); };
  return <SvgArtworkDownload disabled={!value} getSvg={getSvg} title={title} suffix="-graphic" label={t("editor.dataVisual.downloadSvg", { defaultValue: "Download graphic as SVG" })} hint={t("editor.dataVisual.vectorHint", { defaultValue: "Exports this graphic on a transparent background. Text stays editable and uses the selected font where available." })} />;
}
