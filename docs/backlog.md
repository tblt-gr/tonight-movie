# Backlog produit

## Tirage au sort hors liste

Permettre de lancer le dé parmi **tous les films accessibles en France sur les plateformes sélectionnées**, sans choisir de liste Letterboxd. Le tirage pourra reprendre les critères actuels : durée maximale, genre, note minimale et plateforme précise. Il devra afficher la date des disponibilités et exclure les locations non incluses dans l'abonnement.

Cette fonction attend une source de catalogue par fournisseur suffisamment complète et autorisée pour un service public. L'import actuel cherche des offres uniquement pour les films présents dans les listes ouvertes ; il ne sait pas énumérer de façon fiable tous les films de Prime Video, Max via Prime ou des autres services. Un simple appel aux titres « populaires » donnerait un tirage biaisé et ne satisferait pas l'objectif.

### Travail nécessaire

1. Choisir une API ou un jeu de données avec droits de réutilisation, filtrage France/fournisseur/type d'offre et pagination complète.
2. Stocker un catalogue de films dédoublonnés par identifiant stable, avec date de synchronisation des offres et expiration.
3. Construire un index des candidats par plateforme, genre, durée et note ; distinguer clairement les titres sans durée ou note.
4. Tirer uniformément dans les candidats filtrés, avec exclusion facultative des derniers tirages et lien vers la plateforme.
5. Contrôler la couverture du catalogue avant d'appeler le résultat « tous les films disponibles ».

## Extension Letterboxd

Voir [extension-plan.md](extension-plan.md). L'extension utilisera le même service de disponibilité que le site.
