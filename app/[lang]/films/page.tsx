import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FilmBrowser } from "@/components/FilmBrowser";
import { RequireServices } from "@/components/RequireServices";
import { hasLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: hasLocale(lang) ? getDictionary(lang).meta.films : undefined };
}

export default async function FilmsPage({ params }: Props) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <>
      <RequireServices />
      <h1>{getDictionary(lang).browse.title}</h1>
      <Suspense>
        <FilmBrowser />
      </Suspense>
    </>
  );
}
