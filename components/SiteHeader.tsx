"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/tirage", label: "Tirage" },
  { href: "/films", label: "Films" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const home = pathname === "/";
  return (
    <header className="site-header">
      <div className="shell">
        <Link className="brand" href="/">
          Tonight’s Movie
        </Link>
        {!home && (
          <nav className="site-nav" aria-label="Pages">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    ? "page"
                    : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <Link
          className="about-link"
          href="/a-propos"
          aria-current={pathname === "/a-propos" ? "page" : undefined}
        >
          À propos
        </Link>
        {!home && (
          <Link
            className="gear"
            href="/reglages"
            aria-label="Réglages"
            aria-current={pathname === "/reglages" ? "page" : undefined}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M2 5h9M15 5h3M2 10h3M9 10h9M2 15h9M15 15h3" />
              <circle cx="13" cy="5" r="2" />
              <circle cx="7" cy="10" r="2" />
              <circle cx="13" cy="15" r="2" />
            </svg>
          </Link>
        )}
      </div>
    </header>
  );
}
