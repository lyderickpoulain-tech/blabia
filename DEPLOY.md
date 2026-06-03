# DEPLOY.md — Guide de déploiement BlabIA

Ce document liste toutes les variables d'environnement requises, leur rôle, et les étapes de mise en production sur Railway.

---

## Variables d'environnement

### Base de données

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/railway` | Connexion PostgreSQL. Railway injecte cette variable automatiquement si le plugin PostgreSQL est ajouté au projet. |

**Dans Railway** : ajouter un plugin **PostgreSQL** depuis le Dashboard → `DATABASE_URL` est injectée automatiquement dans le service.

---

### Authentification

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `JWT_SECRET` | ✅ | `a1b2c3...` (64+ chars) | Clé de signature des tokens JWT. Doit être longue et aléatoire. Changer cette valeur invalide toutes les sessions actives. |

Générer une valeur sécurisée :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### Anthropic

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `ANTHROPIC_API_KEY` | ✅ | `sk-ant-api03-...` | Clé API Anthropic pour tous les appels Claude (sessions agents, synthèse, extraction outils/plan, contexte projet). Disponible sur [console.anthropic.com](https://console.anthropic.com). |

> BlabIA utilise `claude-sonnet-4-6` par défaut. Les utilisateurs peuvent sélectionner `claude-opus-4-8` par session pour les tâches complexes.

---

### Serveur

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `PORT` | ⚙️ auto | `3000` | Port d'écoute Express. Railway l'injecte automatiquement — ne pas définir manuellement en production. |
| `NODE_ENV` | ✅ | `production` | Active le service des fichiers statiques Vite et désactive les logs de debug. Doit être `production` en Railway. |

---

### URL de l'application

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `FRONTEND_URL` | ✅ | `https://blabia.rasia-editions.fr` | URL publique de l'application. Utilisée pour : (1) les liens d'invitation dans les emails, (2) la configuration CORS en développement. En production avec domaine custom, doit correspondre exactement au domaine configuré. |

> Après connexion du domaine OVH, mettre à jour cette variable de `https://blabia-production.up.railway.app` vers `https://blabia.rasia-editions.fr`.

---

### Email (Resend)

| Variable | Requis | Exemple | Rôle |
|----------|--------|---------|------|
| `RESEND_API_KEY` | ⚠️ optionnel | `re_xxxxxxxxx` | Clé API [Resend](https://resend.com) pour l'envoi des emails d'invitation. **Si absente**, les liens d'invitation s'affichent uniquement dans les logs du serveur (console Railway). |

Les emails sont envoyés depuis `contact@rasia-editions.fr` (adresse Rasia Éditions vérifiée dans Resend). Si le domaine expéditeur change, modifier `FROM_ADDRESS` dans `server/src/services/email.js`.

**Configuration Resend requise :**
1. Créer un compte sur [resend.com](https://resend.com)
2. Vérifier le domaine expéditeur (`rasia-editions.fr`)
3. Générer une clé API et l'ajouter dans Railway Variables

---

## Variables récapitulatives

Copier ce bloc dans Railway → Variables pour configurer l'application complète :

```env
# ── Obligatoires ────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://...          # fournie par le plugin PostgreSQL Railway
JWT_SECRET=<64_chars_random>
ANTHROPIC_API_KEY=sk-ant-api03-...
NODE_ENV=production
FRONTEND_URL=https://blabia.rasia-editions.fr

# ── Optionnelles ────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...                  # sans clé : liens en console uniquement
```

---

## Déploiement Railway — Étapes complètes

### 1. Créer le projet Railway

1. Se connecter sur [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo** → sélectionner le dépôt BlabIA
3. Railway détecte automatiquement le `Dockerfile` (via `railway.toml`)

### 2. Ajouter le plugin PostgreSQL

1. Dans le projet Railway → **+ New** → **Database** → **Add PostgreSQL**
2. La variable `DATABASE_URL` est injectée automatiquement dans le service blabia

### 3. Configurer les variables

Dans le service **blabia** → onglet **Variables** → ajouter toutes les variables listées ci-dessus.

### 4. Premier déploiement

Railway déclenche un build automatiquement à chaque push sur `main`. Le `CMD` du Dockerfile exécute :
```bash
cd /app/server && npx prisma migrate deploy && node src/index.js
```

Les migrations Prisma s'appliquent automatiquement au démarrage. Le healthcheck (`GET /api/health`) doit répondre `200` pour que Railway marque le déploiement comme réussi (timeout : 5 min).

### 5. Créer l'administrateur initial

Après le premier déploiement réussi, exécuter via Railway Shell (service → Shell) :
```bash
cd /app/server && npm run seed:admin
```

Ou configurer les variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` avant le seed si le script les lit depuis l'environnement.

### 6. Vérifier le déploiement

```bash
curl https://blabia-production.up.railway.app/api/health
# → { "status": "ok", "message": "BlabIA server en ligne", "timestamp": "..." }

curl https://blabia-production.up.railway.app/api/ping
# → { "ok": true }
```

---

## Connexion du domaine OVH

Voir la section dédiée dans [README.md](README.md#connexion-du-domaine-ovh--blabiara sia-editionsfr).

Résumé des actions après connexion du domaine :

1. Railway → Settings → Networking → Custom Domain → `blabia.rasia-editions.fr`
2. OVH → Zone DNS → CNAME : `blabia` → valeur Railway
3. Railway → Variables → `FRONTEND_URL=https://blabia.rasia-editions.fr`
4. (optionnel) Resend → Domaines → vérifier que l'expéditeur correspond toujours

---

## Migrations Prisma

Les migrations s'exécutent **automatiquement** au démarrage en production. Pour appliquer manuellement après un push :

```bash
# Via Railway Shell
cd /app/server && npx prisma migrate deploy

# En local
cd server && npx prisma migrate deploy
```

Pour créer une nouvelle migration en développement :
```bash
cd server && npx prisma migrate dev --name description_de_la_migration
```

### Historique des migrations v1.3

| Migration | Description |
|-----------|-------------|
| `20260601194423_init` | Schéma initial : User, Project, Session, Agent |
| `20260602000001` | Champ `context` sur Project |
| `20260602000002` | Champ `parentSessionId` sur Session |
| `20260602000003` | Table Agent (bibliothèque) |
| `20260602000004` | Champ `techStack` (JSONB) sur User |
| `20260602000005` | Table ProjectMember (collaborateurs) |
| `20260603000001` | Champs `hasCode`, `codeStatus` sur Session |
| `20260603000002` | Champs `model`, `fullContext` sur Session |
| `20260603000003` | Champs `techStack` sur Project, `suggestedTools` sur Session |
| `20260603000004` | Table ProjectAgent (agents par projet) |
| `20260603000005` | Tables Milestone et TodoItem (plan projet) |
| `20260603000006` | Champ `planSuggestions` (JSONB) sur Session |
| `20260603000007` | Champ `timeline` (JSONB, default `[]`) sur Session |

---

## Cold start Railway

Le plan Railway **Starter (gratuit)** met les services en veille après inactivité. BlabIA inclut un endpoint `/api/ping` qui répond en < 10 ms, appelé silencieusement au chargement du frontend pour réveiller le serveur avant l'interaction utilisateur.

**Pour supprimer définitivement le cold start** : passer au plan Railway **Hobby (5 €/mois)**. Le service reste actif en permanence.

---

## Surveillance

| Endpoint | Rôle |
|----------|------|
| `GET /api/health` | Healthcheck Railway — vérifié à chaque déploiement |
| `GET /api/ping` | Warm-up cold start — < 10 ms garanti |

Les logs Railway sont accessibles depuis le service → onglet **Logs**. Les erreurs d'appels Anthropic et les événements SSE y sont tracés avec préfixe `[sessions]`, `[plan]`, etc.
