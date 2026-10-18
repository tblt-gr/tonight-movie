import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FilmPoster } from "@/components/FilmPoster";
import { HomeRedirect } from "@/components/HomeRedirect";
import { REEL_PROVIDERS, pickReel } from "@/lib/home-reel";
import { getProviders, popularOnProvider } from "@/lib/tmdb";

export const metadata: Metadata = {
  title: "Tonight’s Movie — Un seul film pour ce soir",
  description:
    "Vous ne savez pas quoi regarder ce soir ? Indiquez vos plateformes en France et laissez le hasard choisir un film que vous pouvez lancer maintenant.",
};

/** The reel is rebuilt from TMDB at most once a day, like the data behind it. */
export const revalidate = 86400;

const steps = [
  {
    title: "Vos services",
    text: "Cochez les plateformes auxquelles vous êtes abonné en France.",
    accent: false,
  },
  {
    title: "Vos films, si vous voulez",
    text: "Vous utilisez Letterboxd ? Importez votre export pour tirer parmi vos films. Sinon, passez : ce n’est pas obligatoire.",
    accent: true,
  },
  {
    title: "Votre film",
    text: "Un seul film, avec l’affiche, la durée, la note et les services qui le proposent. Pas convaincu ? Tirez-en un autre.",
    accent: false,
  },
];

const REEL = [
  { title: "Le Mépris", tone: "tone-3" },
  { title: "Le salaire de la peur", tone: "tone-1" },
  { title: "Playtime", tone: "tone-2" },
];

/** One popular film per provider, or `null` when TMDB cannot supply all of them. */
async function loadReel() {
  const [popular, providers] = await Promise.all([
    Promise.allSettled(REEL_PROVIDERS.map(({ id }) => popularOnProvider(id))),
    getProviders().catch(() => null),
  ]);
  const logos = new Map(providers?.providers.map((provider) => [provider.id, provider.logo]));
  const reel = pickReel(
    popular.map((result) => (result.status === "fulfilled" ? result.value : [])),
  );
  if (reel.length !== REEL_PROVIDERS.length) return null;
  return reel.map((film) => ({ ...film, logo: logos.get(String(film.providerId)) ?? null }));
}

export default async function HomePage() {
  const reel = await loadReel();
  return (
    <>
      <HomeRedirect />
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-copy">
          <h1 id="home-title">
            <span>Vous ne savez pas</span>
            <span>quoi regarder</span>
            <span className="home-accent">ce soir ?</span>
          </h1>
          <p className="home-lead">
            Un seul film, tiré parmi ceux que vous pouvez regarder avec vos abonnements. Fini le
            défilement sans fin.
          </p>
          <div className="home-cta">
            <Link className="button primary" href="/reglages">
              Commencer
            </Link>
            <Image
              className="decor-popcorn"
              src="/popcorn.png"
              alt=""
              width={72}
              height={94}
              draggable={false}
            />
          </div>
        </div>
        <div className="home-reel" aria-hidden="true">
          {reel
            ? reel.map((film) => (
                <div key={film.tmdbId} className="poster-card has-poster">
                  <FilmPoster title={film.title} poster={film.poster} />
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
            : REEL.map((poster) => (
                <div key={poster.title} className={`poster-card ${poster.tone}`}>
                  <b>{poster.title}</b>
                </div>
              ))}
        </div>
      </section>
      <ol className="home-steps" aria-label="Comment ça marche">
        {steps.map((step) => (
          <li key={step.title}>
            <h2 className={step.accent ? "is-accent" : undefined}>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
