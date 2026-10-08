# BlabIA

Plateforme de réunions virtuelles entre un humain et des agents IA orchestrés, au service d'un objectif de projet. Usage personnel : on privilégie la simplicité et la robustesse à la généricité.

## Architecture

```
client/   React 18 + Vite + Tailwind
server/   Node + Express
          server/src/routes/sessions/   sous-routeur express ("réunions")
          server/src/services/prompts/ construction des prompts (agent, orchestrateur, livrables)
          server/src/services/markers.js  parsing des marqueurs [DECISION]/[SUGGEST_AGENT]/[SUGGEST_STEP]/[NEED_TOOL]
server/prisma/   schema.prisma + migrations SQL
```

- **Requêtes** : via **knex** (`server/src/utils/db.js`).
- **Migrations** : via **Prisma** (`server/prisma/schema.prisma` + `prisma migrate deploy` au démarrage, cf. `Dockerfile`). Prisma ne sert qu'aux migrations — aucune requête applicative ne passe par le client Prisma.
- **Déploiement** : Railway.
- **Poste de dev** : Windows ARM64 — aucune dépendance native (JS pur uniquement).

## Glossaire

| Terme UI | Modèle DB | Sens |
|---|---|---|
| **Réunion planifiée** | `Milestone` | Un objectif à traiter, placé dans la timeline du projet (nom de table conservé pour éviter une migration lourde) |
| **Réunion tenue** | `Session` (mode `meeting`) | La conversation réelle entre l'humain et les agents, liée ou non à une réunion planifiée |
| **Compte-rendu** | `Session.summary` | Synthèse de la réunion, injectée en mémoire projet (`Project.context`) à la clôture |
| **Livrable** | `Session.summary` / `Session.planSuggestions` selon le type | Résultat typé produit à la clôture : prompt Claude Code, plan d'étapes, etc. (Phase 3 introduira `Session.deliverable` pour le distinguer proprement du compte-rendu) |
| **Outils** | `User.toolbox`, `Project.techStack` | Stack technique personnelle et par projet (Phase 4 refond ce domaine) |

## Historique récent (v5.0, phase 1)

Le projet a longtemps fait coexister deux systèmes de réunion : un pipeline **legacy** (`NewSessionLegacy`, `SessionRunner`, route `/run`, champs `Session.exchanges`/`agents`) et le pipeline **actuel** (`StartMeeting` → `MeetingRoom`, route `/chat`, champs `Session.messages`/`activeAgents`). Le pipeline legacy a été supprimé en phase 1 de la v5.0 après migration des données (`exchanges` → `messages`, voir migration `20261008000001_v5_migrate_legacy_sessions`). Toute session passe désormais par `mode = 'meeting'`.

## Conventions

- **Migrations non destructives.** Base de prod = données réelles. On ajoute des colonnes, on copie les données en SQL dans la migration, on marque l'ancien champ `// DEPRECATED` dans le schéma. **Aucun `DROP` de colonne ou de table.** Toujours faire un `pg_dump` avant un déploiement qui inclut une migration.
- Chaque nouvelle migration Prisma met à jour `schema.prisma` en même temps (schéma et base restent synchronisés).
- Les requêtes applicatives passent par **knex**, jamais par le client Prisma généré.
- **Droits d'accès** : chaque route vérifie l'accès via `findProject(projectId, userId, isAdmin)` (`server/src/utils/projectHelpers.js`) — même pattern partout.
- **Prompts centralisés** dans `server/src/services/prompts/` (`agentPrompt.js`, `orchestratorPrompt.js`, `deliverablePrompts.js`). Aucune consigne d'agent ne doit être construite côté client.
- **Marqueurs d'agent** (`[DECISION:…]`, `[SUGGEST_AGENT:…]`, `[SUGGEST_STEP:…]`, `[NEED_TOOL:…]`) parsés exclusivement via `server/src/services/markers.js#parseAgentOutput`.
- **Champs JSONB** lus côté serveur via `server/src/utils/parseJsonField.js` (gère valeur déjà parsée, chaîne JSON, null, JSON invalide) plutôt que des variantes locales `Array.isArray(x) ? x : JSON.parse(...)`.
- Interface 100 % en français, style visuel Tailwind existant (couleurs `blabia-*`).

## Commandes utiles

```bash
# Client
cd client && npm run dev        # dev server Vite
cd client && npm run build      # build de prod

# Serveur
cd server && npm run dev        # nodemon
cd server && npm run start      # prod
cd server && npm test           # vitest (server/src/**/__tests__)

# Prisma
cd server && npx prisma validate
cd server && npx prisma migrate deploy   # applique les migrations en attente
cd server && npx prisma generate
```
