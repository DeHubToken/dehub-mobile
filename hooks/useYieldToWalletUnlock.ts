import { useEffect, useState } from "react";
import {
  isWalletUnlockPromptOpen,
  registerYieldingSheet,
  subscribeWalletUnlockPrompt,
} from "../libs/wallet-lock";

/**
 * True while this sheet should be hidden so the wallet unlock prompt can show
 * on top of it (see libs/wallet-lock). Pass the result into the Modal's
 * `visible` as `visible && !yielded`; the component stays mounted, so an
 * in-flight send carries on and the sheet comes back exactly where it was.
 */
export function useYieldToWalletUnlock(visible: boolean, enabled = true): boolean {
  const [promptOpen, setPromptOpen] = useState(isWalletUnlockPromptOpen);
  useEffect(() => subscribeWalletUnlockPrompt(setPromptOpen), []);
  useEffect(() => {
    if (!enabled || !visible) return;
    return registerYieldingSheet();
  }, [enabled, visible]);
  return enabled && visible && promptOpen;
}
