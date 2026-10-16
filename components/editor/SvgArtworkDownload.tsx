import React from "react";
import TextArtworkDownload from "./TextArtworkDownload";
export default function SvgArtworkDownload({ getSvg, ...props }: { getSvg: (signal: AbortSignal) => string | Promise<string>; disabled?: boolean; title: string; label: string; hint: string; suffix?: string }) {
  return <TextArtworkDownload {...props} getContent={getSvg} extension="svg" mime="image/svg+xml" />;
}
