"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/components/I18nProvider";
import { OTHER_LOCALE, routeOf, switchLocalePath } from "@/lib/i18n/config";

/** The same page in the other language. */
function LanguageLink({ search }: { search: string }) {
  const { lang, t } = useI18n();
  const pathname = usePathname();
  const target = switchLocalePath(lang, OTHER_LOCALE[lang], pathname);
  // A plain link: the language lives in the root layout, which a full load renders cleanly.
  return (
    <a
      className="about-link"
      href={search ? `${target}?${search}` : target}
      lang={t.nav.switchLang}
      hrefLang={t.nav.switchLang}
      title={t.nav.switchTo}
      aria-label={t.nav.switchTo}
    >
      {t.nav.switchShort}
    </a>
  );
}

/** Reads the query string, which suspends a static page: only the link is held back. */
function LanguageSwitch() {
  return <LanguageLink search={useSearchParams().toString()} />;
}

export function SiteHeader() {
  const { lang, t, href } = useI18n();
  const pathname = usePathname();
  const home = routeOf(lang, pathname) === "home";
  const nav = [
    { href: href("draw"), label: t.nav.draw },
    { href: href("films"), label: t.nav.films },
  ];
  return (
    <header className="site-header">
      <div className="shell">
        <Link className="brand" href={href("home")}>
          <Image src="/popcorn.png" alt="" width={22} height={29} draggable={false} />
          <span>
            Tonight’s <span className="brand-accent">Movie</span>
          </span>
        </Link>
        {!home && (
          <nav className="site-nav" aria-label={t.nav.pages}>
            {nav.map((item) => (
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
        <div className="header-links">
          <Link
            className="about-link"
            href={href("about")}
            aria-current={pathname === href("about") ? "page" : undefined}
          >
            {t.nav.about}
          </Link>
          <Suspense fallback={<LanguageLink search="" />}>
            <LanguageSwitch />
          </Suspense>
        </div>
        {!home && (
          <Link
            className="gear"
            href={href("settings")}
            aria-label={t.nav.settings}
            aria-current={pathname === href("settings") ? "page" : undefined}
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
