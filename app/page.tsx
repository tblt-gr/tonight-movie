import initialData from "@/dist/films.json";
import { Catalog } from "@/components/Catalog";
import type { Snapshot } from "@/lib/types";

export default function HomePage() {
  return <Catalog initialSnapshot={initialData as Snapshot} />;
}
