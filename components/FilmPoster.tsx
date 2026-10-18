export function FilmPoster({
  title,
  poster,
  alt,
}: {
  title: string;
  poster: string | null;
  alt: string;
}) {
  return poster ? (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves sized posters.
    <img src={poster} alt={alt} width={342} height={513} loading="lazy" />
  ) : (
    <span className="poster-missing">{title}</span>
  );
}
