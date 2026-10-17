"use client";

import { useState } from "react";
import type { Provider } from "@/lib/types";

export function PlatformIcon({ provider, name }: { provider?: Provider; name: string }) {
  const icon = provider?.icon;
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  return icon?.startsWith("https://") && icon !== failedIcon ? (
    // Provider icons are tiny source-provided assets; image optimization adds no value here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="provider-icon"
      src={icon}
      alt=""
      loading="lazy"
      onError={() => setFailedIcon(icon)}
    />
  ) : (
    <span className="provider-monogram" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
