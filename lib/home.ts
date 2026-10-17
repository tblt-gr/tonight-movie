/** Returns where `/` must send the visitor, or `null` to keep the presentation. */
export function homeRedirectTarget(services: readonly string[], search: string) {
  if (new URLSearchParams(search).has("intro")) return null;
  return services.length > 0 ? "/tirage" : null;
}
