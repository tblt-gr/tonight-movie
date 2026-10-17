"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="shell">
        <Link className="brand" href="/">
          Tonight’s Movie
        </Link>
        {pathname !== "/" && (
          <Link className="gear" href="/reglages" aria-label="Réglages">
            <Settings aria-hidden="true" />
          </Link>
        )}
      </div>
    </header>
  );
}
