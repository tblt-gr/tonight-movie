import { offersToShow } from "@/lib/draw-state";
import type { MovieDetails } from "@/lib/types";

/** Where to watch a film on the visitor's services, or À vérifier when that is not confirmed. */
export function FilmOffers({
  film,
  services,
}: {
  film: Pick<MovieDetails, "offers" | "availabilityStatus" | "offersUrl">;
  services: ReadonlySet<string>;
}) {
  const offers = offersToShow(film, services);
  const verified = film.availabilityStatus === "verified" && offers.length > 0;
  return (
    <section aria-label="Où le regarder">
      {verified ? (
        <ul className="result-offers">
          {offers.map((offer) => {
            const href = offer.url ?? film.offersUrl;
            return (
              <li key={offer.id}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Regarder sur ${offer.name} (nouvel onglet)`}
                  >
                    {offer.name}
                  </a>
                ) : (
                  <span>{offer.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tag-check">
          <span className="tag">À vérifier</span>{" "}
          {film.offersUrl ? (
            <a href={film.offersUrl} target="_blank" rel="noopener noreferrer">
              Voir la disponibilité sur TMDB (nouvel onglet)
            </a>
          ) : (
            "La disponibilité n’est pas confirmée."
          )}
        </p>
      )}
    </section>
  );
}
