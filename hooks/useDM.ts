import { useDMContext } from '../context/DMContextNew';

export function useDM() {
  // Thin wrapper so call sites remain unchanged
  return useDMContext();
}
