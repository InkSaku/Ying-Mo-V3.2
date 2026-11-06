import { useSyncExternalStore } from "react";

const query = "(max-width: 767px)";
const subscribe = (notify) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
export function useNarrowScreen() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
