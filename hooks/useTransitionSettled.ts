import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";

/**
 * False until this screen's push animation has finished.
 *
 * Native-stack starts the animation only once the new screen's first render
 * commits, so anything below the fold mounted in that render delays the
 * transition itself. Gate it on this instead. The timer covers screens that
 * appear without an animation, where no transitionEnd arrives.
 */
export function useTransitionSettled(fallbackMs = 600): boolean {
  const navigation = useNavigation();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled) return;
    const done = () => setSettled(true);
    const unsubscribe = (navigation as any).addListener("transitionEnd", (e: any) => {
      if (!e?.data?.closing) done();
    });
    const timer = setTimeout(done, fallbackMs);
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [navigation, settled, fallbackMs]);

  return settled;
}
