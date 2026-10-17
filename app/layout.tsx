import type { Metadata } from "next";
import "@fontsource-variable/familjen-grotesk/wght.css";
import "./base.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Tonight’s Movie — trouvez votre film du soir",
  description:
    "Choisissez vos plateformes en France et laissez le hasard choisir votre film du soir.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <SiteHeader />
        <main className="shell page">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
