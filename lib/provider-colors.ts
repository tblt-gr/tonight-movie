export type Brand = { background: string; ink: string };

const LIGHT = "#0b0b0d";
const WHITE = "#ffffff";

const NETFLIX: Brand = { background: "#E50914", ink: WHITE };
const PRIME: Brand = { background: "#00A8E1", ink: LIGHT };
const APPLE: Brand = { background: WHITE, ink: LIGHT };
const YOUTUBE: Brand = { background: "#FF0000", ink: WHITE };

/**
 * Brand colors of the main French providers, by TMDB provider id. Approximate by hand:
 * TMDB offers no color, and a provider missing here simply keeps the accent color.
 */
const BRANDS: Record<string, Brand> = {
  "8": NETFLIX,
  "1796": NETFLIX,
  "119": PRIME,
  "10": PRIME,
  "350": APPLE,
  "2": APPLE,
  "337": { background: "#113CCF", ink: WHITE },
  "283": { background: "#F47521", ink: LIGHT },
  "381": { background: WHITE, ink: LIGHT },
  "58": { background: WHITE, ink: LIGHT },
  "234": { background: "#FA5014", ink: LIGHT },
  "192": YOUTUBE,
  "188": YOUTUBE,
  "11": { background: WHITE, ink: LIGHT },
  "147": { background: "#FFC400", ink: LIGHT },
  "531": { background: "#0064FF", ink: WHITE },
  "35": { background: "#BF0000", ink: WHITE },
  "300": { background: "#FFF200", ink: LIGHT },
  "538": { background: "#E5A00D", ink: LIGHT },
  "61": { background: "#FF7900", ink: LIGHT },
  "193": { background: "#E2001A", ink: WHITE },
  "415": { background: "#0082FA", ink: WHITE },
};

export const brandOf = (providerId: string): Brand | null => BRANDS[providerId] ?? null;
