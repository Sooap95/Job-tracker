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

## Démarrage

Ouvrir `index.html` fonctionne toujours sans serveur. Pour tester la PWA et le service worker, servir les fichiers localement avec un petit serveur web ou les héberger en HTTPS.

Les données sont enregistrées dans `localStorage` et ne quittent pas le navigateur tant qu'une synchronisation GitHub n'est pas lancée. Exporter régulièrement une sauvegarde JSON indépendante.

## Confidentialité

Le dépôt de code peut être public : **il ne doit jamais contenir de candidatures réelles, sauvegardes personnelles ou tokens**.

L'ancienne synchronisation manuelle avec un **second dépôt GitHub privé** est conservée temporairement. Pour l'utiliser :

1. Créer un dépôt GitHub privé dédié aux données.
2. Créer un token *fine-grained*, limité à ce dépôt avec la permission Contents en lecture/écriture.
3. Utiliser « Configurer GitHub » dans l'application, puis « Récupérer » et « Envoyer ».

Le token n'est plus conservé dans `localStorage`. Il est tenu dans `sessionStorage` pour la session du navigateur (et reste donc accessible au JavaScript de la page). Une ancienne configuration qui contenait un token en `localStorage` est migrée automatiquement.

### Limites connues de la synchronisation

- **Ce n'est pas encore une synchronisation automatique avec authentification sécurisée.** Ne la présenter ni comme telle ni comme un système chiffré de bout en bout.
- « Envoyer » bloque une écriture si la version distante diffère de la dernière version récupérée. Sur un nouvel appareil, utiliser d'abord « Récupérer ».
- Lors d'une récupération, une version ambiguë ou plus ancienne ne remplace pas silencieusement les modifications locales. Les conflits sont signalés, mais leur résolution reste manuelle.
- Les suppressions ne possèdent pas encore de mécanisme de synchronisation dédié. Une candidature supprimée localement peut réapparaître depuis une ancienne sauvegarde.
- Ne jamais stocker le token dans le dépôt de code. GitHub Pages peut publier l'interface, pas les données.

Une phase distincte doit introduire l'authentification utilisateur, la conservation des secrets côté serveur, la synchronisation automatique et la résolution fiable des conflits. Aucun identifiant serveur ni accès à des candidatures réelles n'est nécessaire pour évaluer cette V2.

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
