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
  },
  {
    title: "Vos films, si vous voulez",
    text: "Vous utilisez Letterboxd ? Importez votre export pour tirer parmi vos films. Sinon, passez : ce n’est pas obligatoire.",
  },
  {
    title: "Votre film",
    text: "Un seul film, avec l’affiche, la durée, la note et les services qui le proposent. Pas convaincu ? Tirez-en un autre.",
  },
];

export default function HomePage() {
  return (
    <>
      <HomeRedirect />
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">
          Vous ne savez pas quoi regarder <span className="home-accent">ce soir ?</span>
        </h1>
        <p className="home-lead">
          Un seul film, tiré parmi ceux que vous pouvez regarder avec vos abonnements. Fini le
          défilement sans fin.
        </p>
        <Link className="button primary" href="/reglages">
          Commencer
        </Link>
      </section>
      <ol className="home-steps" aria-label="Comment ça marche">
        {steps.map((step) => (
          <li key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
