import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@fontsource-variable/familjen-grotesk/wght.css";
import "../base.css";
import { HIDE_BEFORE_PAINT } from "@/components/HomeRedirect";
import { I18nProvider } from "@/components/I18nProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { LOCALES, hasLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const { meta } = getDictionary(lang);
  return { title: meta.siteTitle, description: meta.siteDescription };
}

export default async function RootLayout({ children, params }: Readonly<Props>) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <html lang={lang} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: HIDE_BEFORE_PAINT }} />
        <I18nProvider lang={lang}>
          <SiteHeader />
          <main className="shell page">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
