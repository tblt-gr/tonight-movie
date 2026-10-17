"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";

export type RecentList = { url: string; title: string; count: number };

export function ProfilePicker({
  currentSource,
  recent,
  loading,
  loadStatus,
  loadError,
  onChoose,
  onRefresh,
  onClearHistory,
}: {
  currentSource: string;
  recent: RecentList[];
  loading: boolean;
  loadStatus: string;
  loadError: boolean;
  onChoose: (url: string) => void;
  onRefresh: () => void;
  onClearHistory: () => void;
}) {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState(
    "Retrouvez vos listes et les collections publiques accessibles depuis votre profil.",
  );
  const [profileError, setProfileError] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [url, setUrl] = useState("");

  async function loadProfile(value: string, updateAddress = true) {
    if (profileLoading) return;
    setProfileLoading(true);
    setProfileStatus("Recherche des collections publiques…");
    setProfileError(false);
    try {
      const response = await fetch(`/api/profile?username=${encodeURIComponent(value.trim())}`);
      const data = (await response.json()) as Profile & { error?: string };
      if (!response.ok) throw new Error(data.error || "Profil inaccessible.");
      setProfile(data);
      setUsername(data.username);
      const count = data.lists.length + Number(Boolean(data.watchlist));
      const unavailable = data.unavailable.map((kind) =>
        kind === "liked" ? "listes aimées" : "watchlist",
      );
      setProfileStatus(
        `${count} collection${count > 1 ? "s" : ""} accessible${count > 1 ? "s" : ""} pour ${data.username}${unavailable.length ? ` · ${unavailable.join(" et ")} non accessibles depuis le serveur` : ""}`,
      );
      if (updateAddress) {
        const address = new URL(window.location.href);
        address.searchParams.set("user", data.username);
        window.history.replaceState(null, "", address);
      }
    } catch (error) {
      setProfile(null);
      setProfileError(true);
      setProfileStatus(error instanceof Error ? error.message : "Profil inaccessible.");
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    const user = new URL(window.location.href).searchParams.get("user");
    if (user) queueMicrotask(() => void loadProfile(user, false));
    // URL-driven initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = [...(profile?.watchlist ? [profile.watchlist] : []), ...(profile?.lists || [])];
  const label = (kind: string) =>
    ({ watchlist: "Watchlist", created: "Ma liste", liked: "Liste aimée" })[
      kind as "watchlist" | "created" | "liked"
    ] || "Liste";

  return (
    <section className="list-loader" aria-label="Choisir une liste Letterboxd">
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          void loadProfile(username);
        }}
      >
        <label htmlFor="usernameInput">Votre nom d’utilisateur Letterboxd</label>
        <div className="list-form-controls">
          <input
            id="usernameInput"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nom d’utilisateur"
            required
            pattern="[A-Za-z0-9_-]{2,40}"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <button type="submit" disabled={profileLoading}>
            Voir les collections
          </button>
        </div>
      </form>
      <div
        className={`profile-status ${profileError ? "load-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {profileStatus}
      </div>
      {entries.length > 0 && (
        <div className="profile-collections">
          {entries.map((item) => (
            <button
              type="button"
              className="profile-collection"
              key={item.url}
              onClick={() => onChoose(item.url)}
            >
              <span className="profile-kind">{label(item.kind)}</span>
              <strong>{item.title}</strong>
              <span>
                {item.count == null
                  ? "Voir les films"
                  : `${item.count} film${item.count > 1 ? "s" : ""}`}{" "}
                <span aria-hidden="true">↗</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <details className="url-import">
        <summary>Ou importer directement un lien de liste</summary>
        <form
          className="list-form"
          onSubmit={(event) => {
            event.preventDefault();
            onChoose(url);
          }}
        >
          <label htmlFor="listUrlInput">URL Letterboxd</label>
          <div className="list-form-controls">
            <input
              id="listUrlInput"
              type="url"
              inputMode="url"
              placeholder="https://letterboxd.com/…/list/…/"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="submit" disabled={loading}>
              Charger la liste
            </button>
          </div>
        </form>
      </details>
      <div className="list-loader-bottom">
        <span className={loadError ? "load-error" : ""} role="status" aria-live="polite">
          {loadStatus}
        </span>
        <button
          type="button"
          disabled={loading || !currentSource.startsWith("https://")}
          onClick={onRefresh}
        >
          Actualiser les données
        </button>
      </div>
      {recent.length > 0 && (
        <div className="history-area">
          <span>Listes récentes</span>
          <div className="history-list">
            {recent.map((item) => (
              <button
                type="button"
                className={item.url === currentSource ? "active" : ""}
                key={item.url}
                title={item.url}
                onClick={() => onChoose(item.url)}
              >
                {item.title} · {item.count}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClearHistory}>
            Effacer l’historique
          </button>
        </div>
      )}
    </section>
  );
}
