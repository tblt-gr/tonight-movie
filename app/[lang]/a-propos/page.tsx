import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: hasLocale(lang) ? getDictionary(lang).meta.about : undefined };
}

export default async function AboutPage({ params }: Props) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { about } = getDictionary(lang);
  return (
    <>
      <h1>{about.title}</h1>
      <div className="about">
        <p>{about.intro}</p>
        <section aria-labelledby="about-credits">
          <h2 id="about-credits">{about.creditsTitle}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- Official TMDB logo, served as is. */}
          <img className="about-logo" src="/tmdb-logo.svg" alt="TMDB" width={245} height={18} />
          <p>{about.tmdb}</p>
          <p>
            {about.watchmodeBefore}
            <a href="https://api.watchmode.com/" target="_blank" rel="noopener noreferrer">
              {about.watchmodeLink}
            </a>
            {about.watchmodeAfter}
          </p>
          <p>{about.letterboxd}</p>
        </section>
      </div>
    </>
  );
}
