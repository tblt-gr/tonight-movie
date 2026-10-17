export function FilmPoster({ title, poster }: { title: string; poster: string | null }) {
  return poster ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters.
    <img src={poster} alt={`Affiche de ${title}`} width={342} height={513} loading="lazy" />
  ) : (
    <span className="poster-missing">{title}</span>
  );
}
