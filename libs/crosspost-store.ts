import AsyncStorage from "@react-native-async-storage/async-storage";
import { proxy } from "valtio";

const KEY = "dehub_crosspost_selected";

// Persists between posts on purpose: people cross-post to the same places every time.
export const crossPostState = proxy<{ selected: string[] }>({ selected: [] });

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (raw) crossPostState.selected = JSON.parse(raw);
  })
  .catch(() => {});

export function toggleCrossPostAccount(accountId: string) {
  const selected = crossPostState.selected.includes(accountId)
    ? crossPostState.selected.filter((id) => id !== accountId)
    : [...crossPostState.selected, accountId];
  crossPostState.selected = selected;
  AsyncStorage.setItem(KEY, JSON.stringify(selected)).catch(() => {});
}
