export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <a
          className="tmdb-logo"
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="The Movie Database (nouvel onglet)"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Official TMDB logo, served as is. */}
          <img src="/tmdb-logo.svg" alt="" width={245} height={18} />
        </a>
        <p>
          Ce produit utilise l’API TMDB mais n’est ni soutenu ni certifié par TMDB. Données des
          films fournies par TMDB, disponibilités par JustWatch ; Tonight’s Movie n’est pas soutenu
          par JustWatch.
        </p>
      </div>
    </footer>
  );
}
