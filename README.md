# Pomodoro Activity (Discord Embedded App SDK)

Un minuteur Pomodoro **partagé en temps réel** dans un salon vocal Discord. Tous les
participants voient le même décompte et la même phase ; n'importe qui peut
démarrer / mettre en pause / passer / régler, et tout le monde est synchronisé.

C'est une **Discord Activity** (web app dans une iframe), pas un bot qui « streame ».
C'est la voie officielle, conforme aux CGU, pour du visuel partagé dans le vocal.

---

## Prérequis

- **Node 20+**
- Un compte Discord + un serveur de test où tu peux installer l'app
- **cloudflared** pour exposer le localhost en HTTPS (Discord exige HTTPS)
  `brew install cloudflared` / `winget install cloudflare.cloudflared` / [autres](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

## 1. Developer Portal

1. https://discord.com/developers/applications → **New Application**.
2. **General Information** → copie l'**Application ID** (= ton Client ID).
3. **OAuth2** → copie le **Client Secret**.
4. **Activities** → active l'activité (toggle « Enable Activities »).
5. **Activities → Settings → URL Mappings** : mapping **ROOT** `/` → (l'URL du tunnel,
   ajoutée à l'étape 4 du run). Un seul mapping suffit : Vite relaie `/api`
   (et le WebSocket) vers le serveur local.
6. **Installation** : coche *User Install* et/ou *Guild Install* pour pouvoir lancer
   l'activité dans un salon vocal.

## 2. Configuration locale

```bash
npm install                 # installe client + server (workspaces)
cp .env.example .env        # puis renseigne VITE_DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET
```

## 3. Lancer

```bash
npm run dev                 # client sur :5173, serveur (API + WebSocket) sur :3001
```

Dans un autre terminal, expose le client :

```bash
cloudflared tunnel --url http://localhost:5173
```

Copie l'URL `https://…trycloudflare.com` fournie dans le **mapping ROOT** du portail
(étape 1.5), puis sauvegarde.

## 4. Tester

Dans un serveur où l'app est installée : rejoins un **salon vocal** → bouton
**Activités** (la fusée) → choisis ton app. Ouvre-la sur un 2ᵉ compte ou un 2ᵉ client
pour voir la synchro en direct.

---

## Comment marche la synchro

- Le **serveur est l'unique horloge**. Il détient l'état par `instanceId` (identifiant
  partagé par tous les participants d'une même Activity).
- Les clients affichent **localement** à partir de `endsAt`, en corrigeant le décalage
  d'horloge via le `serverTime` envoyé à chaque message. Le serveur ne diffuse que sur
  **changement d'état** et **transition de phase** → trafic en O(événements), pas O(secondes).
- Cycle : `focus → pause courte → … → pause longue` toutes les *N* concentrations
  (4 par défaut), puis nouveau cycle.

## Structure

```
client/   Vite + React + @discord/embedded-app-sdk  (l'UI dans l'iframe)
server/   Express (échange OAuth) + ws (état + sync temps réel)
.env      partagé : VITE_* pour le client, le reste pour le serveur
```

## Notes & limites

- **État en mémoire** : il est réinitialisé au redémarrage du serveur. Pour la prod,
  remplace la `Map` par Redis (ou autre store partagé).
- **Polices système** (pas de Google Fonts) pour éviter les blocages CSP de l'iframe
  Discord. Pour une police custom, auto-héberge-la ou ajoute son domaine aux URL Mappings.
- **Prod** : héberge le client (build statique) et le serveur séparément, et déclare
  alors **deux** mappings : `/` → client, `/api` → serveur.
- Le secret OAuth ne quitte jamais le serveur.
```

## Credits

- Pomodoro backdrop: "Roosa hommikuudu Tolkuse rabas" by Märt Kose, CC BY-SA 3.0 EE, via Wikimedia Commons.
