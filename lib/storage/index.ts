import { library } from "@/lib/storage/library";
import { resetSettings } from "@/lib/storage/settings";
import { clearUnavailable } from "@/lib/storage/status";

const resetListeners = new Set<() => void>();

/** Lets a screen drop what it shows about data that `resetAll` is about to erase. */
export function onReset(listener: () => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}

/** Wipes the settings and every imported film this app stored in the browser. */
export async function resetAll() {
  resetSettings();
  await library.reset();
  clearUnavailable();
  resetListeners.forEach((listener) => listener());
}
