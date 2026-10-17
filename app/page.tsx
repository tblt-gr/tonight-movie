import type { Metadata } from "next";
import Link from "next/link";
import { HomeRedirect } from "@/components/HomeRedirect";

export const metadata: Metadata = {
  title: "Tonight’s Movie — Un seul film pour ce soir",
  description:
    "Vous ne savez pas quoi regarder ce soir ? Indiquez vos plateformes en France et laissez le hasard choisir un film que vous pouvez lancer maintenant.",
};

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

export default function HomePage() {
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
            <Popcorn />
          </div>
        </div>
        <div className="home-reel" aria-hidden="true">
          {REEL.map((poster) => (
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

function Popcorn() {
  return (
    <svg className="decor-popcorn" viewBox="0 0 100 124" aria-hidden="true" focusable="false">
      <g className="kernel">
        <circle cx="26" cy="34" r="12" />
        <circle cx="40" cy="26" r="11" />
        <circle cx="55" cy="24" r="14" />
        <circle cx="70" cy="32" r="12" />
        <circle cx="48" cy="38" r="12" />
        <circle cx="64" cy="40" r="10" />
        <circle cx="34" cy="42" r="10" />
      </g>
      <g className="fleck">
        <circle cx="38" cy="22" r="3.4" />
        <circle cx="62" cy="20" r="3.4" />
        <circle cx="74" cy="30" r="3" />
        <circle cx="52" cy="40" r="2.6" />
      </g>
      <circle className="kernel" cx="88" cy="60" r="6" />
      <circle className="kernel" cx="8" cy="76" r="4.5" />
      <path className="bucket" d="M12 48 Q50 56 88 48 L79 114 Q50 120 21 114 Z" />
      <path className="stripe" d="M26 52 L30 116 M50 54 V119 M74 52 L70 116" />
      <path className="stripe rim" d="M12 48 Q50 56 88 48" />
    </svg>
  );
}
