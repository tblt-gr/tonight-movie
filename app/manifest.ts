import type { MetadataRoute } from "next";
import { getDictionary } from "@/lib/i18n";
import { THEME_COLOR } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  const { meta } = getDictionary("fr");
  return {
    name: "Tonight’s Movie",
    short_name: "Tonight’s Movie",
    description: meta.siteDescription,
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" }],
  };
}
