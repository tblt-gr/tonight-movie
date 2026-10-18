"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { brandFor } from "@/lib/brand-color";
import type { Brand } from "@/lib/provider-colors";

/** A link to a streaming service, with its logo and brand colors as in the settings. */
export function ProviderLink({
  id,
  name,
  icon,
  href,
  label,
  className = "",
}: {
  id: string;
  name: string;
  icon: string | null;
  href: string;
  label?: string;
  className?: string;
}) {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    let alive = true;
    void brandFor(id, icon).then((found) => alive && setBrand(found));
    return () => {
      alive = false;
    };
  }, [id, icon]);
  return (
    <a
      className={`provider-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label ?? `Regarder sur ${name}`} (nouvel onglet)`}
      style={
        brand
          ? ({ "--chip": brand.background, "--chip-ink": brand.ink } as CSSProperties)
          : undefined
      }
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized logos.
        <img src={icon} alt="" width={32} height={32} loading="lazy" />
      )}
      <span>{name}</span>
    </a>
  );
}
