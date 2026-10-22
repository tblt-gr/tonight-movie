import type { Locale } from "@/lib/i18n/config";

export const DEFAULT_REGION = "FR";

/** The countries TMDB lists watch providers for. */
export const REGIONS: readonly string[] = [
  "AE",
  "AL",
  "AR",
  "AT",
  "AU",
  "AZ",
  "BA",
  "BB",
  "BE",
  "BG",
  "BH",
  "BO",
  "BR",
  "BS",
  "BY",
  "CA",
  "CH",
  "CI",
  "CL",
  "CO",
  "CR",
  "CU",
  "CV",
  "CY",
  "CZ",
  "DE",
  "DK",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "ES",
  "FI",
  "FJ",
  "FR",
  "GB",
  "GH",
  "GI",
  "GQ",
  "GR",
  "GT",
  "HK",
  "HN",
  "HR",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IQ",
  "IS",
  "IT",
  "JM",
  "JO",
  "JP",
  "KE",
  "KR",
  "KW",
  "LB",
  "LI",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "MK",
  "MT",
  "MU",
  "MX",
  "MY",
  "MZ",
  "NE",
  "NG",
  "NI",
  "NL",
  "NO",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PH",
  "PK",
  "PL",
  "PS",
  "PT",
  "PY",
  "QA",
  "RO",
  "RS",
  "RU",
  "SA",
  "SE",
  "SG",
  "SI",
  "SK",
  "SM",
  "SN",
  "SV",
  "TH",
  "TN",
  "TR",
  "TW",
  "TZ",
  "UA",
  "UG",
  "US",
  "UY",
  "VA",
  "VE",
  "XK",
  "YE",
  "ZA",
  "ZM",
  "ZW",
];

export const isRegion = (value: unknown): value is string =>
  typeof value === "string" && REGIONS.includes(value);

/**
 * The country of the first browser language that names one and that TMDB covers, so `fr-BE`
 * gives `BE`. Falls back to France when no language does.
 */
export function detectRegion(languages: readonly string[]): string {
  for (const tag of languages) {
    const region = tag.split("-")[1]?.toUpperCase();
    if (isRegion(region)) return region;
  }
  return DEFAULT_REGION;
}

/** The country the visitor chose, or the one their browser suggests until they choose. */
export function effectiveRegion(chosen: string | null, languages: readonly string[]): string {
  return isRegion(chosen) ? chosen : detectRegion(languages);
}

/** The country to use in the browser: the saved choice, else the one the browser suggests. */
export function browserRegion(chosen: string | null): string {
  return effectiveRegion(chosen, typeof navigator === "undefined" ? [] : navigator.languages);
}

/** `region=BE` for the app's own API routes; France is the default, so it adds nothing. */
export function regionParam(region: string): string {
  return region === DEFAULT_REGION ? "" : `region=${region}`;
}

/** Countries sorted by their name in the page language. */
export function regionOptions(lang: Locale): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([lang], { type: "region" });
  return REGIONS.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, lang),
  );
}
