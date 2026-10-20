import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FilmPoster } from "@/components/FilmPoster";
import { HomeRedirect } from "@/components/HomeRedirect";
import { REEL_PROVIDERS, pickReel } from "@/lib/home-reel";
import { hasLocale, localizedPath, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";
import { getProviders, popularOnProvider } from "@/lib/tmdb";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const { meta } = getDictionary(lang);
  return { title: meta.homeTitle, description: meta.homeDescription };
}

const REEL_TONES = ["tone-3", "tone-1", "tone-2"];

/** One popular film per provider, or `null` when TMDB cannot supply all of them. */
async function loadReel(lang: Locale) {
  const [popular, providers] = await Promise.all([
    Promise.allSettled(REEL_PROVIDERS.map(({ id }) => popularOnProvider(id, lang))),
    getProviders(lang).catch(() => null),
  ]);
  const logos = new Map(providers?.providers.map((provider) => [provider.id, provider.logo]));
  const reel = pickReel(
    popular.map((result) => (result.status === "fulfilled" ? result.value : [])),
  );
  if (reel.length !== REEL_PROVIDERS.length) return null;
  return reel.map((film) => ({ ...film, logo: logos.get(String(film.providerId)) ?? null }));
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getDictionary(lang);
  // Rendered per request: a build has no TMDB key (Docker), and a failed lookup would stay in
  // the page for a day. The TMDB responses themselves are cached for a day.
  await connection();
  const reel = await loadReel(lang);
  return (
    <>
      <HomeRedirect />
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <h1 id="home-title">
            <span>{t.home.title[0]}</span>
            <span>{t.home.title[1]}</span>
            <span className="home-accent">{t.home.title[2]}</span>
          </h1>
          <p className="home-lead">{t.home.lead}</p>
          <div className="home-cta">
            <Link className="button primary" href={localizedPath(lang, "settings")}>
              {t.home.cta}
            </Link>
          </div>
        </div>
        <div className="home-reel" aria-hidden="true">
          {reel
            ? reel.map((film) => (
                <div key={film.tmdbId} className="poster-card has-poster">
                  <FilmPoster
                    title={film.title}
                    poster={film.poster}
                    alt={t.common.posterOf(film.title)}
                  />
                  <span className="poster-provider">
                    {film.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Official TMDB logo, served as is.
                      <img src={film.logo} alt={film.provider} width={32} height={32} />
                    ) : (
                      film.provider
                    )}
                  </span>
                </div>
              ))
            : t.home.reel.map((title, index) => (
                <div key={title} className={`poster-card ${REEL_TONES[index]}`}>
                  <b>{title}</b>
                </div>
              ))}
        </div>
      </section>
      <ol className="home-steps" aria-label={t.home.stepsLabel}>
        {t.home.steps.map((step) => (
          <li key={step.title} className={step.optional ? "is-optional" : undefined}>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
