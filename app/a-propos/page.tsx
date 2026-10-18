export const metadata = { title: "À propos — Tonight’s Movie" };

export default function AboutPage() {
  return (
    <>
      <h1>À propos</h1>
      <div className="about">
        <p>
          Tonight’s Movie tire un film que vous pouvez regarder ce soir avec vos abonnements en
          France. Vos réglages et votre export Letterboxd restent dans ce navigateur : rien n’est
          envoyé à un serveur.
        </p>
        <section aria-labelledby="about-credits">
          <h2 id="about-credits">Crédits</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- Official TMDB logo, served as is. */}
          <img className="about-logo" src="/tmdb-logo.svg" alt="TMDB" width={245} height={18} />
          <p>
            Ce produit utilise l’API TMDB mais n’est ni soutenu ni certifié par TMDB. Les données
            des films sont fournies par TMDB, les disponibilités par JustWatch ; Tonight’s Movie
            n’est pas soutenu par JustWatch.
          </p>
          <p>
            Les liens directs vers les plateformes viennent de l’API{" "}
            <a href="https://api.watchmode.com/" target="_blank" rel="noopener noreferrer">
              Watchmode
            </a>{" "}
            (nouvel onglet) lorsqu’elle est configurée.
          </p>
          <p>Tonight’s Movie est également indépendant de Letterboxd.</p>
        </section>
      </div>
    </>
  );
}
