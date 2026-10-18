import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportBlock } from "@/components/ImportBlock";
import { ServicesPicker } from "@/components/ServicesPicker";
import { hasLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: hasLocale(lang) ? getDictionary(lang).meta.settings : undefined };
}

export default async function SettingsPage({ params }: Props) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { settings } = getDictionary(lang);
  return (
    <>
      <h1>{settings.title}</h1>
      <p className="page-note">{settings.note}</p>
      <ServicesPicker>
        <ImportBlock />
      </ServicesPicker>
    </>
  );
}
