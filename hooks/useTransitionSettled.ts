import { useContext, useEffect, useState } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import { RouteTransitionReadyContext } from '../context/RouteTransitionReadyContext';

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
  const route = useRoute();
  const completedRoute = useContext(RouteTransitionReadyContext);
  const inherited = completedRoute === route.key;
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (settled || inherited) return;
    const done = () => setSettled(true);
    const unsubscribe = (navigation as any).addListener("transitionEnd", (e: any) => {
      if (!e?.data?.closing) done();
    });
    const timer = setTimeout(done, fallbackMs);
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [navigation, settled, inherited, fallbackMs]);

  return inherited || settled;
}
