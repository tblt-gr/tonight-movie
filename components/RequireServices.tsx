"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/components/I18nProvider";
import { loadSettings } from "@/lib/storage/settings";

/** Sends the visitor to the settings page while no streaming service is saved. */
export function RequireServices() {
  const router = useRouter();
  const { href } = useI18n();
  useEffect(() => {
    if (loadSettings().services.length === 0) router.replace(href("settings"));
  }, [router, href]);
  return null;
}
