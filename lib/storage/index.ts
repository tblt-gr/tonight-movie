import { library } from "@/lib/storage/library";
import { resetSettings } from "@/lib/storage/settings";
import { clearUnavailable } from "@/lib/storage/status";

/** Wipes the settings and every imported film this app stored in the browser. */
export async function resetAll() {
  resetSettings();
  await library.reset();
  clearUnavailable();
}
