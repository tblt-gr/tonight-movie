import { en } from "@/lib/i18n/dictionaries/en";
import { fr, type Dictionary } from "@/lib/i18n/dictionaries/fr";
import type { Locale } from "@/lib/i18n/config";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export const getDictionary = (lang: Locale): Dictionary => DICTIONARIES[lang];
