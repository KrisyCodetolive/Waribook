# 🧾 WariBook

**La facturation simple pour les commerçants et PME d'Afrique.**
Factures en FCFA, envoi par WhatsApp, numéros Mobile Money (Wave, Orange Money, MTN MoMo, Moov) sur chaque facture, relances des impayés en un clic, et abonnements payables via CinetPay.

> Ce guide est écrit pour quelqu'un qui **n'est pas développeur**. Suivez les étapes dans l'ordre.

---

## ✨ Ce que fait l'application

| Page | Rôle |
|---|---|
| `/` | Landing page (présentation, tarifs, FAQ) |
| `/inscription`, `/connexion` | Création de compte et connexion |
| `/app` | Tableau de bord : facturé, encaissé, impayés, graphique, clients à relancer |
| `/app/factures` | Créer, envoyer sur WhatsApp, encaisser, imprimer en PDF |
| `/app/clients` | Carnet clients avec le montant que chacun doit |
| `/app/parametres` | Nom du commerce, numéros Mobile Money, mentions légales (RCCM, NCC) |
| `/app/abonnement` | Offres Gratuit / Pro (5 000 FCFA) / Business (15 000 FCFA) |
| `/f/xxxx` | Facture publique que voit votre client (sans compte) |

**Modèle économique** : offre gratuite limitée (10 factures/mois, 20 clients), puis abonnement mensuel payé par Mobile Money via CinetPay. Les prix se modifient dans `src/utils.js` (bloc `PLANS`).

---

## 1️⃣ Mettre le code sur GitHub (sans ligne de commande)

1. Créez un compte gratuit sur [github.com](https://github.com).
2. Cliquez sur **+** (en haut à droite) → **New repository**. Nom : `waribook`. Choisissez **Private** si vous voulez garder le code privé. Cliquez **Create repository**.
3. Sur la page du dépôt vide, cliquez sur le lien **uploading an existing file**.
4. Décompressez le fichier `waribook.zip` sur votre ordinateur, ouvrez le dossier `waribook`, sélectionnez **tout son contenu** et glissez-le dans la page GitHub.
5. En bas, cliquez **Commit changes**. ✅ Votre code est sur GitHub.

> ⚠️ Les fichiers commençant par un point (`.gitignore`, `.env.example`) peuvent être cachés sur votre ordinateur. Sur Mac : `Cmd + Shift + .` pour les afficher. Sur Windows : Explorateur → Affichage → cocher « Éléments masqués ».

---

## 2️⃣ Mettre le site en ligne (Render)

[Render](https://render.com) héberge l'application et la relie à votre GitHub.

1. Créez un compte sur render.com avec **« Sign in with GitHub »**.
2. Cliquez **New +** → **Blueprint**, choisissez votre dépôt `waribook`. Render lit le fichier `render.yaml` et prépare tout automatiquement (serveur + disque pour la base de données).
3. Validez avec **Apply**. Après quelques minutes, votre site est en ligne à une adresse du type `https://waribook-xxxx.onrender.com`.
4. Dans Render → votre service → **Environment**, ajoutez `BASE_URL` = l'adresse de votre site (sans `/` à la fin).

> 💡 Le disque persistant (pour ne pas perdre vos données) nécessite l'offre payante « Starter » de Render (quelques dollars par mois). C'est configuré ainsi dans `render.yaml`. Alternative : [Railway](https://railway.app) avec un « Volume » monté sur `/var/data` et `DATABASE_PATH=/var/data/waribook.db`.

### Votre propre nom de domaine
Achetez un domaine (ex : `waribook.ci` ou `.com`), puis dans Render → **Settings → Custom Domains**, ajoutez-le et suivez les instructions DNS. Pensez à mettre à jour `BASE_URL`.

---

## 3️⃣ Activer les vrais paiements (CinetPay)

Tant que les clés ne sont pas renseignées, l'application est en **mode démo** : cliquer sur « Payer » active l'offre sans paiement réel. Pratique pour tester, mais à désactiver avant de vendre.

1. Créez un compte marchand sur [cinetpay.com](https://cinetpay.com) et faites valider votre entreprise (pièces demandées : RCCM, pièce d'identité…).
2. Dans votre espace CinetPay, récupérez votre **API Key** et votre **Site ID** (rubrique Intégration).
3. Dans Render → **Environment**, ajoutez :
   - `CINETPAY_API_KEY` = votre clé
   - `CINETPAY_SITE_ID` = votre site ID
4. Redémarrez le service. Les abonnements passent maintenant par la page de paiement CinetPay (Mobile Money + cartes). L'abonnement est activé automatiquement pour 30 jours après confirmation du paiement.

---

## 4️⃣ Personnaliser

| Je veux changer… | Fichier |
|---|---|
| Le nom de l'app | variable `APP_NAME` (ou dans `.env`) |
| Les prix et limites des offres | `src/utils.js` → `PLANS` |
| Les textes de la landing page | `views/landing.ejs` |
| Les couleurs | `public/css/style.css` (tout en haut, bloc `:root`) |
| Le logo | `views/partials/logo.ejs` et `public/favicon.svg` |
| Le pays par défaut WhatsApp | variable `DEFAULT_COUNTRY_CODE` (225, 221, 237…) |

Chaque modification envoyée sur GitHub (bouton **Edit** ✏️ sur un fichier, puis **Commit**) est automatiquement remise en ligne par Render.

---

## 💻 (Optionnel) Lancer sur votre ordinateur

Installez [Node.js](https://nodejs.org) (version 20 ou plus), puis dans un terminal ouvert dans le dossier :

```bash
npm install        # installe les dépendances (une seule fois)
npm run seed       # crée un compte démo : demo@waribook.africa / demo1234
npm start          # lance le site sur http://localhost:3000
npm test           # vérifie que tout fonctionne
```

---

## 🧱 Technique (pour un futur développeur)

- **Node.js + Express 5**, pages rendues côté serveur avec **EJS** (aucun build front-end)
- **SQLite** via `better-sqlite3` (un seul fichier, `data/waribook.db` par défaut)
- Sessions par cookie signé (`cookie-session`), mots de passe hachés avec `bcryptjs`
- Paiements : `src/cinetpay.js` (API Checkout v2 : initialisation + vérification + URL de notification `/paiement/notification`)

```
src/
  server.js        point d'entrée
  db.js            schéma de la base de données
  utils.js         offres, formats FCFA, liens WhatsApp
  cinetpay.js      paiements
  routes/          public, auth, app (factures/clients), billing
views/             pages HTML (EJS)
public/            CSS, JS, favicon
scripts/           seed (données démo) et smoke-test
```

### Pistes d'évolution
- Mot de passe oublié (envoi d'e-mail via Brevo ou Resend)
- Relances automatiques programmées (WhatsApp Business API)
- Devis transformables en factures, multi-utilisateurs par entreprise
- Lien de paiement Mobile Money direct sur chaque facture (CinetPay / Wave Business)

Licence MIT.
# Waribook
