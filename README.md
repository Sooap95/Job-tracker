# Job Tracker 2.0

Application personnelle de suivi des candidatures et de préparation des rapports mensuels RAV / ORP en Suisse.

## Nouveautés de la V2

- Interface responsive, navigation latérale sur ordinateur et navigation inférieure sur mobile.
- Tableau de bord présentant les candidatures, les prochaines actions et la progression du rapport RAV.
- Vues liste, cartes sur mobile et tableau Kanban.
- Ajout rapide d'une candidature, avec champs complémentaires RAV accessibles séparément.
- Dates limites et dates de relance.
- Les offres marquées **« A postuler »** ne figurent plus dans le rapport RAV, même si une date est renseignée.
- PWA avec mise en cache des fichiers de l'interface uniquement, sur HTTPS ou localhost.
- Conservation des données au format JSON d'origine, dans la clé navigateur `jobtracker_v3`.
- Synchronisation privée automatique facultative avec connexion GitHub, serveur Cloudflare Worker et dépôt privé distinct.
- Mise en file locale des modifications hors connexion, fusion par identifiant et date de modification, prévention des réapparitions après suppression.

## Démarrage

Ouvrir `index.html` fonctionne toujours sans serveur. Pour tester la PWA et le service worker, servir les fichiers localement avec un petit serveur web ou les héberger en HTTPS.

Les données sont enregistrées dans `localStorage`. Sur l'interface locale, elles ne quittent pas le navigateur tant qu'une synchronisation GitHub manuelle n'est pas lancée. Sur l'interface hébergée, après connexion, les modifications sont automatiquement envoyées au dépôt privé. Exporter régulièrement une sauvegarde JSON indépendante.

## Synchronisation sécurisée pour plusieurs appareils

**Code prêt à configurer, mais pas déployé.** Un simple hébergement GitHub Pages ne suffit pas à garder un secret côté serveur. Cette édition utilise un **Cloudflare Worker** qui héberge l'interface et gère les connexions et l'API sur la même origine HTTPS. Le dépôt public ne contient aucun secret ni candidature personnelle.

### 1. Préparer GitHub

1. Créer un **second dépôt privé**, distinct de `Job-tracker`, par exemple `Sooap95/job-tracker-private-data`. Ne jamais y activer GitHub Pages.
2. Préparer sa branche `main`, par exemple avec un README. Le fichier `data/jobs.json` sera créé lors de la première synchronisation.
3. Créer un **fine-grained personal access token** réservé à ce **seul** dépôt privé, avec la permission **Contents: Read and write**. Il sera enregistré **uniquement comme secret Worker**, jamais dans l'application ou un commit.
4. Créer une **GitHub OAuth App** dans les paramètres développeur GitHub. L'adresse de sa page d'accueil sera l'URL HTTPS du Worker, et le callback devra être exactement `https://VOTRE-ADRESSE/auth/github/callback`. Le client ID et son secret seront utilisés côté Worker. Ce login demande uniquement l'identité, sans autorisation `repo`.
5. Vérifier l'identifiant numérique du **seul** compte GitHub autorisé. Utiliser ce nombre, stable même si le pseudonyme change, pour `ALLOWED_GITHUB_USER_ID`.

La GitHub OAuth App valide l'identité. Elle **n'accède pas aux candidatures**. C'est le token serveur restreint au second dépôt privé qui lit et écrit le fichier. Cette séparation limite l'accès accordé au navigateur.

### 2. Configurer Cloudflare Workers

Installer les dépendances de développement avec `npm install`. Créer le Worker avec `npx wrangler deploy` uniquement après avoir configuré les éléments ci-dessous.

Le fichier `wrangler.jsonc` configure l'interface statique sous `dist/`, le backend sous `worker/index.js`, la branche `main` et le chemin `data/jobs.json`. Le déploiement utilise `npm run deploy` (exécute la construction statique puis publie). Il peut être nécessaire d'effectuer un premier déploiement pour obtenir son URL avant de créer le callback GitHub, puis de redéployer avec les secrets.

Définir ces secrets dans Cloudflare avec `npx wrangler secret put NOM_DU_SECRET` :

| Secret | Valeur |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID de la GitHub OAuth App |
| `GITHUB_OAUTH_CLIENT_SECRET` | Secret de cette OAuth App |
| `ALLOWED_GITHUB_USER_ID` | Identifiant numérique GitHub du propriétaire |
| `DATA_REPO` | `propriétaire/nom-du-dépôt-privé` |
| `DATA_REPO_TOKEN` | Token fine-grained limité à ce dépôt privé |
| `SESSION_SIGNING_KEY` | Chaîne aléatoire forte d'au moins 32 octets, jamais réutilisée |

Vérifier ensuite `/api/me`, qui doit retourner `enabled: true`. L'application présentera « Se connecter avec GitHub ». Ouvrir **la même URL HTTPS** sur le PC et le téléphone. Les sessions sont protégées par des cookies `Secure`, `HttpOnly` et `SameSite=Lax`, valables 7 jours. Le login utilise `state` et PKCE S256.

### 3. Première migration et sécurité des sauvegardes

1. Exporter une copie JSON des candidatures depuis la version existante.
2. Ouvrir la version hébergée **sur l'appareil qui contient la liste la plus complète**, puis importer ce JSON si nécessaire.
3. Se connecter et attendre l'indication « Synchronisé ». Vérifier les dossiers et le rapport RAV.
4. Ouvrir la même adresse sur le second appareil, se connecter et attendre la récupération.
5. Éviter d'utiliser en même temps l'ancien synchroniseur manuel sur `data/jobs.json` : il ne comprend pas la structure V2 (`records` et `tombstones`).

Les opérations non transmises restent dans le navigateur, même sans réseau. Le serveur compare les dates `updatedAt` et conserve les suppressions. En cas de version incompatible, il **refuse d'écraser les données** et laisse la copie locale intacte, avec une alerte. La résolution de ce cas rare demande encore une intervention manuelle et une sauvegarde préalable. Il n'existe pas de fusion automatique champ par champ. Une horloge d'appareil incorrecte peut également déclencher un conflit.

**Limite de confidentialité importante :** le dépôt de données est privé au sens des autorisations GitHub, mais les données ne sont **pas chiffrées de bout en bout**. GitHub et le Worker traitent le contenu en clair. Une copie est également gardée par le navigateur de chaque appareil, y compris après déconnexion. Utiliser des appareils et profils de navigation personnels, protégés par un verrouillage d'écran.

## Confidentialité

Le dépôt de code peut être public : **il ne doit jamais contenir de candidatures réelles, sauvegardes personnelles ou tokens**.

L'ancienne synchronisation manuelle avec un **second dépôt GitHub privé** reste disponible en mode local ou sans Worker configuré. Pour l'utiliser :

1. Créer un dépôt GitHub privé dédié aux données.
2. Créer un token *fine-grained*, limité à ce dépôt avec la permission Contents en lecture/écriture.
3. Utiliser « Configurer GitHub » dans l'application, puis « Récupérer » et « Envoyer ».

Le token n'est plus conservé dans `localStorage`. Il est tenu dans `sessionStorage` pour la session du navigateur (et reste donc accessible au JavaScript de la page). Une ancienne configuration qui contenait un token en `localStorage` est migrée automatiquement.

### Limites connues de la synchronisation manuelle historique

- Les boutons « Récupérer » et « Envoyer » ne constituent pas une synchronisation automatique : ils restent séparés du nouveau mode hébergé.
- « Envoyer » bloque une écriture si la version distante diffère de la dernière version récupérée. Sur un nouvel appareil, utiliser d'abord « Récupérer ».
- Lors d'une récupération, une version ambiguë ou plus ancienne ne remplace pas silencieusement les modifications locales. Les conflits sont signalés, mais leur résolution reste manuelle.
- Les suppressions ne possèdent pas encore de mécanisme de synchronisation dédié. Une candidature supprimée localement peut réapparaître depuis une ancienne sauvegarde.
- Ne jamais stocker le token dans le dépôt de code. GitHub Pages peut publier l'interface, pas les données.

La synchronisation sécurisée n'est effective qu'après configuration et déploiement du Worker. Aucun identifiant ni accès aux candidatures réelles n'est nécessaire pour examiner son code et exécuter les tests.

## Sauvegardes et rapports RAV

- **Sauvegarder en JSON** : export intégral des candidatures.
- **Restaurer** : remplace les données locales après confirmation.
- **Fusionner** : ajoute ou actualise les candidatures, avec dédoublonnage par identifiant puis entreprise + poste + date.
- Le rapport mensuel RAV propose CSV et impression / PDF via le navigateur.

La vérification de complétude RAV dans l'outil constitue une aide à la saisie, pas une validation officielle des informations exigées par l'ORP.

## Fichiers

- `index.html` : interface et formulaires
- `style.css` : design responsive
- `app.js` : suivi, sauvegardes, rapports et synchronisation manuelle
- `manifest.webmanifest`, `icon.svg`, `sw.js` : installation et mise en cache PWA
- `worker/index.js` : OAuth GitHub, sessions et API privée
- `wrangler.jsonc` : configuration Cloudflare Workers sans secrets
- `scripts/build.mjs` : copie en liste blanche des seules ressources publiques dans `dist/`
- `smoke.test.cjs`, `worker.test.mjs` : tests locaux (`npm test`)
