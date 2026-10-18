import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrawMachine } from "@/components/DrawMachine";
import { RequireServices } from "@/components/RequireServices";
import { hasLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: hasLocale(lang) ? getDictionary(lang).meta.draw : undefined };
}

export default async function DrawPage({ params }: Props) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return (
    <>
      <RequireServices />
      <DrawMachine />
    </>
  );
}
