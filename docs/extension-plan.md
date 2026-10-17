# Extension Letterboxd — plan de réalisation

## Objectif

Afficher sur les affiches Letterboxd un indicateur « sur mes plateformes », « ailleurs » ou « aucune offre vérifiée en France », puis permettre un filtre et un tirage au sort directement dans les pages de listes et de watchlists.

Letterboxd propose déjà aux abonnés Pro et Patron des services favoris et un filtre par plateforme. L'extension apporterait surtout la distinction entre abonnements possédés et autres chaînes Prime, des badges visibles sur chaque affiche, un dé avec critères et une expérience sans abonnement Letterboxd payant. [Fonctionnalité officielle](https://letterboxd.com/journal/justwatch-integration/).

## Étapes

1. **Prototype sur une liste publique** : extension Manifest V3, script injecté uniquement sur `letterboxd.com/*/list/*` et `letterboxd.com/*/watchlist/*`. Lire les liens des films dans les éléments `LazyPoster`, ajouter un badge accessible sur l'affiche et une barre de filtres au-dessus de la grille. Surveiller les changements de page avec `MutationObserver`.
2. **Réglages** : fenêtre d'options pour choisir Prime Video, Max via Prime, M6+, France TV via Prime et les autres fournisseurs français. Enregistrer les préférences dans `chrome.storage.sync` quand disponible, avec repli sur `chrome.storage.local`.
3. **Source de données** : demander à un service dédié les offres françaises par identifiant stable de film. Mettre les réponses en cache avec date de collecte. Ne jamais mettre une clé partenaire JustWatch ou TMDB dans l'extension distribuée.
4. **Fonctions de liste** : filtrer par catégories, durée, note et plateforme ; proposer le tirage au sort parmi les films visibles ou les films disponibles sur les plateformes possédées.
5. **Compatibilité** : tester les grilles, listes paginées, watchlists, navigation dynamique, mobile web et changements de balisage Letterboxd. Si le balisage change, masquer proprement l'injection et conserver les pages utilisables.

## Contrat de données envisagé

`GET /api/films/{letterboxdId}/availability?country=FR` → identifiant, durée, note, date de mise à jour, offres `{providerId, providerName, icon, type, url}`. Les types doivent distinguer abonnement/gratuit, location, achat et disponibilité inconnue. Un endpoint groupé évite une requête par affiche.

## Points à résoudre avant diffusion

- **Accès aux données** : l'endpoint de disponibilité de l'[API Letterboxd](https://api-docs.letterboxd.com/) est réservé à ses propres applications. L'[API partenaire JustWatch](https://apis.justwatch.com/docs/api/) demande un contrat et un jeton. Le GraphQL public utilisé par ce prototype local ne constitue pas une dépendance durable pour une extension publiée.
- **Correspondances** : privilégier des identifiants TMDB/Letterboxd/JustWatch plutôt qu'un rapprochement au titre seul. Les éditions comme _Kill Bill: The Whole Bloody Affair_ montrent le risque d'une fausse correspondance.
- **Permissions** : limiter les hôtes à Letterboxd et au domaine de l'API du projet ; pas d'accès général aux onglets ou à l'historique du navigateur.
- **Vie privée** : les plateformes choisies restent dans le navigateur. Une requête d'offres ne doit envoyer que les identifiants des films affichés, jamais le compte Letterboxd ni la liste des abonnements sans nécessité.
- **Marque et attribution** : l'extension doit se présenter comme un outil indépendant et afficher les attributions requises par la source de données retenue.

## Ordre conseillé

Valider d'abord l'application web multi-listes et ses données. Réutiliser ensuite sa logique de catégories et son API dans l'extension ; le code d'injection restera mince.
