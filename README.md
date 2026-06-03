# BlabIA

Plateforme de sessions multi-agents IA pour vos projets. Les agents collaborent, débattent et produisent une restitution structurée à partir d'une tâche définie.

---

## Fonctionnalités v1.3

- **Sessions multi-agents** — équipe constituée automatiquement selon la tâche (Analyste, Créatif, Critique, Expert, Chercheur, Stratège, Rédacteur, Synthésiseur)
- **Trois modes de session** — Temps réel (streaming), Résumé (compact), Conversation (tours alternés avec intervention humaine)
- **Continuation de session** — relancer les agents sur la restitution précédente, fil enrichi tour par tour
- **Export Claude Code** — génération d'un prompt prêt à coller dans Claude Code ; conditionnel (`[HAS_CODE]` détecté dans la synthèse)
- **Timeline par session** — historique chronologique de toutes les étapes (formation équipe, agents, questions, synthèse, export, implémentation) ; onglet persistant dans SessionView + live pendant le run
- **Plan projet** — jalons (Milestone) et todo list (TodoItem) extraits automatiquement depuis les sessions ; vue Plan avec timeline verticale et drag & drop
- **Stack technique par projet** — surcharge de l'environnement global de l'utilisateur ; détection automatique des outils suggérés/manquants
- **Agents par projet** — sélection et réordonnancement des agents disponibles pour chaque projet
- **Bibliothèque d'agents** — agents défaut + agents personnels ; création depuis une suggestion SSE
- **Mémoire projet** — contexte enrichi automatiquement après chaque session
- **Invitations par projet** — lien d'inscription sécurisé envoyé par email (Resend)
- **Administration** — gestion des utilisateurs et projets, envoi d'emails de test
- **Optimisation coûts** — choix du modèle par session (Sonnet par défaut / Opus), contexte tronqué à 2 000 tokens, cache d'équipe pour tâches identiques
- **Cold start Railway** — endpoint `/api/ping` warm-up automatique au chargement de l'app

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, ReactMarkdown |
| Backend | Node.js 20, Express 4 |
| Base de données | PostgreSQL (plugin Railway) |
| ORM / Migrations | Knex (requêtes) + Prisma Migrate (migrations) |
| IA | Anthropic SDK — Claude Sonnet 4.6 / Opus |
| Email | Resend |
| Auth | JWT (expiry 24h) + bcrypt |
| Déploiement | Railway via Dockerfile multi-stage |

---

## Développement local

### Prérequis

- Node.js 20+
- PostgreSQL local (ou tunnel Railway)
- Clé API Anthropic
- (optionnel) Clé API Resend

### Installation

```bash
# Cloner le dépôt
git clone <repo-url> blabIA && cd blabIA

# Installer toutes les dépendances (root + client + server)
npm run install:all

# Copier et remplir les variables d'environnement
cp server/.env.example server/.env
# → éditer server/.env avec vos valeurs locales

# Appliquer les migrations Prisma
cd server && npx prisma migrate deploy && cd ..

# Créer l'administrateur initial
cd server && npm run seed:admin && cd ..
```

### Démarrage

```bash
# Depuis la racine — lance le serveur (port 3001) et le client Vite (port 5173) en parallèle
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173).

---

## Architecture

```
blabIA/
├── client/                 # Frontend React + Vite
│   └── src/
│       ├── pages/          # NewSession, SessionView, ProjectView, PlanView, Dashboard…
│       ├── components/     # SessionRunner, Layout, ExportModal…
│       ├── contexts/       # AuthContext
│       └── utils/          # api.js (axios instance)
├── server/                 # Backend Express
│   ├── src/
│   │   ├── routes/         # auth, sessions, projects, agents, plan, export, admin, users
│   │   ├── services/       # anthropic.js, email.js
│   │   ├── middleware/     # auth.js (JWT)
│   │   └── utils/          # db.js (knex), milestones.js
│   └── prisma/
│       ├── schema.prisma   # Modèle de données
│       └── migrations/     # 13 migrations (init → timeline)
├── Dockerfile              # Build multi-stage : Vite → Node production
├── railway.toml            # Config Railway (Dockerfile + healthcheck)
└── package.json            # Scripts racine (dev, build, install:all)
```

En production, le serveur Express sert à la fois l'API (`/api/*`) et le build Vite statique (`client/dist/`). Pas de serveur frontend séparé.

---

## Connexion du domaine OVH — `blabia.rasia-editions.fr`

### Étape 1 — Ajouter le domaine dans Railway

1. Aller dans Railway → projet **blabia** → service **blabia** → onglet **Settings** → section **Networking**
2. Cliquer **Custom Domain** → saisir `blabia.rasia-editions.fr`
3. Railway affiche un enregistrement CNAME à copier (format : `xxxxxx.railway.app`)

### Étape 2 — Configurer la zone DNS OVH

1. Se connecter à l'espace client OVH → **Domaines** → `rasia-editions.fr` → **Zone DNS**
2. Cliquer **Ajouter une entrée** → type **CNAME**
3. Remplir :
   - **Sous-domaine** : `blabia`
   - **Cible** : valeur CNAME fournie par Railway (inclure le point final si OVH le demande)
   - **TTL** : 3600 (ou valeur par défaut)
4. Valider. La propagation DNS prend 5 à 30 minutes (jusqu'à 24h selon les résolveurs).

### Étape 3 — Vérifier le certificat SSL

Railway génère automatiquement un certificat Let's Encrypt une fois le CNAME propagé. Le statut passe à **Active** dans Settings → Networking. Aucune action manuelle requise.

### Étape 4 — Mettre à jour les variables Railway

Dans Railway → projet → service blabia → onglet **Variables** :

```
FRONTEND_URL = https://blabia.rasia-editions.fr
```

> Cette variable contrôle les liens dans les emails d'invitation et le CORS en développement.

Redéployer si Railway ne le fait pas automatiquement.

### Vérification

```bash
# Tester la résolution DNS
nslookup blabia.rasia-editions.fr

# Tester le healthcheck
curl https://blabia.rasia-editions.fr/api/health
```

---

## Déploiement Railway

Voir [DEPLOY.md](DEPLOY.md) pour la liste complète des variables d'environnement et les étapes de mise en production.

Après chaque modification :
```bash
git add .
git commit -m "BlabIA v1.3 - Evolution X : description"
git push origin main
```

Railway redéploie automatiquement. Les migrations Prisma s'exécutent au démarrage du container (`prisma migrate deploy` dans le `CMD` du Dockerfile).

---

## Licence

Projet privé — Rasia Éditions © 2026
