import type { PanResponderCallbacks } from "react-native";

const SLOP = 6;

/** Keep vertical travel available to the feed until a horizontal scrub wins. */
export function feedSeekResponder(seek: (x: number) => void, finish: () => void): PanResponderCallbacks {
  let horizontal = false;
  let vertical = false;
  return {
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { horizontal = false; vertical = false; },
    onPanResponderMove: (event, gesture) => {
      if (!horizontal && !vertical) {
        if (Math.abs(gesture.dy) > SLOP && Math.abs(gesture.dy) >= Math.abs(gesture.dx)) vertical = true;
        else if (Math.abs(gesture.dx) > SLOP) horizontal = true;
      }
      if (horizontal) seek(event.nativeEvent.locationX);
    },
    onShouldBlockNativeResponder: () => horizontal,
    onPanResponderTerminationRequest: () => !horizontal,
    onPanResponderRelease: (event, gesture) => {
      if (horizontal || (!vertical && Math.hypot(gesture.dx, gesture.dy) <= SLOP)) seek(event.nativeEvent.locationX);
      finish();
    },
    onPanResponderTerminate: finish,
  };
}
