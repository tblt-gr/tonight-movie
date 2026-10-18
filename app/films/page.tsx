import { Suspense } from "react";
import { FilmBrowser } from "@/components/FilmBrowser";
import { RequireServices } from "@/components/RequireServices";

export const metadata = { title: "Films — Tonight’s Movie" };

export default function FilmsPage() {
  return (
    <>
      <RequireServices />
      <h1>Parcourir les films</h1>
      <Suspense>
        <FilmBrowser />
      </Suspense>
    </>
  );
}
