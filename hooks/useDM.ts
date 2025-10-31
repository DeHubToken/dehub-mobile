import { useDMContext } from '../context/DMContext';

export function useDM() {
  // Thin wrapper so call sites remain unchanged
  return useDMContext();
}
