/** Distances are points and velocity is points per second. */
export function completesSwipeBack(distance: number, vertical: number, velocity: number): boolean {
  return Math.abs(vertical) <= 32 && distance > Math.abs(vertical) * 2 &&
    (distance >= 64 || (distance >= 28 && velocity >= 650));
}
