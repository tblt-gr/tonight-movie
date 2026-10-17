"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadSettings } from "@/lib/storage/settings";

/** Sends the visitor to the settings page while no streaming service is saved. */
export function RequireServices() {
  const router = useRouter();
  useEffect(() => {
    if (loadSettings().services.length === 0) router.replace("/reglages");
  }, [router]);
  return null;
}
