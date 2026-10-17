import type { Metadata } from "next";
import "./base.css";
import "./features.css";
import "./profile.css";
import "./next.css";

export const metadata: Metadata = {
  title: "Tonight’s Movie — trouvez votre film du soir",
  description:
    "Explorez vos listes Letterboxd et trouvez où regarder un film en France selon vos plateformes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
