# Job Tracker — Suivi de candidatures RAV

Outil local (HTML/CSS/JS, sans backend) pour suivre les candidatures d'emploi et générer le rapport mensuel "Preuves de recherches personnelles d'emploi" pour l'ORP/RAV suisse.

## Utilisation

Ouvrez `index.html` directement dans un navigateur (double-clic, ou `file://...`). Aucune installation, aucun serveur requis.

Les données sont stockées dans le `localStorage` du navigateur — elles restent tant que vous utilisez le même navigateur sur le même appareil.

## Sauvegarde

- **Export** (bouton en haut) : télécharge un fichier JSON de toutes vos candidatures. À faire régulièrement.
- **Import** : remplace toutes les données actuelles par celles d'un fichier JSON.
- **Fusionner** : ajoute/actualise les candidatures d'un fichier JSON sans supprimer les existantes (dédoublonnage par `id`, sinon par entreprise+poste+date).

## Synchronisation GitHub (optionnelle, multi-appareils)

Le bouton ⚙ ouvre la configuration de synchronisation. Elle permet de pousser (☁ ↑) et récupérer (☁ ↓) vos candidatures depuis un **dépôt GitHub privé dédié aux données** (distinct de celui-ci si vous versionnez aussi le code).

Étapes recommandées :

1. Créez un **second dépôt GitHub privé** réservé aux données (ex. `job-tracker-data`), séparé du dépôt de code. Ainsi, si vous partagez un jour le code de l'outil, vos données personnelles ne sont jamais dans le même historique Git.
2. Créez un **token d'accès personnel fine-grained** sur GitHub (Settings → Developer settings → Personal access tokens → Fine-grained tokens), limité à ce seul dépôt, avec la permission **Contents: Read and write** uniquement.
3. Dans l'outil, cliquez ⚙ et renseignez owner / repo / branche / chemin (`data/jobs.json` par défaut) / token.

⚠️ Le token est stocké en clair dans le `localStorage` de ce navigateur. N'utilisez cette fonctionnalité que sur un appareil de confiance, et révoquez le token depuis GitHub si vous n'en avez plus besoin.

## Hébergement — ce qu'il faut savoir

Ce dépôt de **code** peut être poussé sur GitHub en privé sans risque : il ne contient aucune donnée personnelle (voir `.gitignore`).

⚠️ **N'activez pas GitHub Pages sur ce dépôt s'il contient vos données** (dossier `data/`) — sur un compte GitHub gratuit, un site Pages reste **public** même si le dépôt est privé (l'option "rendre Pages privé" nécessite un plan payant GitHub Pro/Team/Enterprise). L'usage prévu ici est :

- Le **code** (`index.html`, `style.css`, `app.js`) versionné sur GitHub, ouvert localement en `file://`.
- Les **données** synchronisées via l'API GitHub (bouton ☁) vers un dépôt privé séparé, jamais via Pages.

## Structure

```
job-tracker/
├── index.html   ← structure de la page
├── style.css    ← thème et mise en page
├── app.js       ← logique de l'application
├── .gitignore   ← exclut les exports JSON réels
└── README.md
```
