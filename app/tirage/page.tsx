import { RequireServices } from "@/components/RequireServices";

export const metadata = { title: "Tirage — Tonight’s Movie" };

export default function DrawPage() {
  return (
    <>
      <RequireServices />
      <h1>Tirage</h1>
    </>
  );
}
