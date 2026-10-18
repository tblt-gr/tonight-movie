import { ImportBlock } from "@/components/ImportBlock";
import { ServicesPicker } from "@/components/ServicesPicker";

export const metadata = { title: "Réglages — Tonight’s Movie" };

export default function SettingsPage() {
  return (
    <>
      <h1>Réglages</h1>
      <p className="page-note">Vos données restent dans ce navigateur</p>
      <ServicesPicker>
        <ImportBlock />
      </ServicesPicker>
    </>
  );
}
