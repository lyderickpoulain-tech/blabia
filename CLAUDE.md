# BlabIA

Plateforme de réunions virtuelles entre un humain et des agents IA orchestrés, au service d'un objectif de projet. Usage personnel : on privilégie la simplicité et la robustesse à la généricité.

## Architecture

```
client/   React 18 + Vite + Tailwind
server/   Node + Express
          server/src/routes/sessions/   sous-routeur express ("réunions")
          server/src/services/prompts/ construction des prompts (agent, orchestrateur, livrables)
          server/src/services/markers.js  parsing des marqueurs [DECISION]/[SUGGEST_AGENT]/[SUGGEST_MEETING]/[NEED_TOOL]
server/prisma/   schema.prisma + migrations SQL
```

- **Requêtes** : via **knex** (`server/src/utils/db.js`).
- **Migrations** : via **Prisma** (`server/prisma/schema.prisma` + `prisma migrate deploy` au démarrage, cf. `Dockerfile`). Prisma ne sert qu'aux migrations — aucune requête applicative ne passe par le client Prisma.
- **Déploiement** : Railway.
- **Poste de dev** : Windows ARM64 — aucune dépendance native (JS pur uniquement).

## Glossaire

| Terme UI | Modèle DB | Sens |
|---|---|---|
| **Réunion planifiée** | `Milestone` | Un objectif à traiter, placé dans le plan des réunions du projet (nom de table conservé pour éviter une migration lourde) |
| **Réunion tenue** | `Session` (mode `meeting`) | La conversation réelle entre l'humain et les agents, liée ou non à une réunion planifiée |
| **Compte-rendu** | `Session.summary` | Toujours produit à la clôture, injecté en mémoire projet (`Project.context`). Structuré en relevé de décisions pour le type `decision` |
| **Livrable** | `Session.deliverable` | Résultat typé produit en plus du CR à la clôture : prompt (`claude_code`) ou liste d'outils proposés (`stack`) |
| **Type d'objectif** | `Milestone.type` / `Session.intention` | `decision` (prise de décision), `claude_code` (prompt Claude Code), `stack` (revue des outils) |
| **Mes outils** | `User.tools` | Outils de l'utilisateur, tous projets (statut j'utilise / j'ai un compte / à essayer, coût, note) |
| **Outils du projet** | `Project.tools` | Sélection parmi « Mes outils » + outils complémentaires (suggéré / validé / refusé, coût) |
| **Catalogue d'outils** | `server/src/services/tools/catalog.js` | 16 catégories en termes simples, outils connus, coûts indicatifs, positions de la carte — servi au client par `GET /api/tools/catalog` |

## Historique récent (v5.0)

- **Phase 1** : suppression du pipeline legacy (`NewSessionLegacy`, `SessionRunner`, route `/run`, champs `Session.exchanges`/`agents`), remplacé par `StartMeeting` → `MeetingRoom` (`/chat`, champs `Session.messages`/`activeAgents`). Toute session passe par `mode = 'meeting'`. Prompts centralisés, parsing des marqueurs centralisé.
- **Phase 2** : fin du streaming texte (`callAgent` non streamé, bulles multiples séparées par `[NEXT]`), vrai Markdown dans les bulles, curseurs pédagogie/humour (`Project.expertiseLevel`/`humorLevel`, surcharge par `Session`), recherche web câblée (outil `web_search_20260318`, `allowed_callers: ['direct']` requis pour obtenir des citations fiables).
- **Phase 3** : types d'objectif consolidés en `decision | claude_code | stack` (migration `20261008000003_v5_meeting_types_deliverable` — anciennes valeurs `summary`/`synthesis`/`memory`/`timeline_steps`/`meeting`/`technical`/`milestone` → `decision`, `stack_check` → `stack`). Livrable séparé du compte-rendu (`Session.deliverable`). Le livrable n'est produit qu'à la clôture (« Conclure la réunion », génération automatique, plus de bouton « Générer » séparé). Suggestions de nouvelles réunions via `[SUGGEST_MEETING:{...}]` (remplace `[SUGGEST_STEP]`), stockées dans `Session.pendingMeetingSuggestions`, positionnables via une référence courte (`R1`, `R2`…) résolue au moment du « Plan des réunions » (`server/src/routes/sessions/meetingPlan.js`).
- **Phase 4** : refonte des outils. `User.techStack` + `User.toolbox` → `User.tools` ; `Project.techStack`/`hasTechnicalStack` + `Session.pendingToolSuggestions` v4 → `Project.tools` (migration `20261008000004_v5_tools` : colonnes additives, conversion en JS à la première lecture dans `services/tools/toolsStore.js`, `NULL` = pas encore migré). Page unique « Mes outils » (`/outils`), carte des outils (`components/tools/ToolsMap.jsx`), panneau « Outils » du projet. Réunion `stack` : grille des catégories + `[NEED_TOOL:{…, costMin, costMax, freeTier, priceSource}]`, validation outil par outil à la clôture (`POST /sessions/:id/tools/apply`). Supprimés : `EnvironmentPage`, `MyToolbox`, `StackPanel`, `StackCheckModal`, `utils/techStack.js`, routes `tech-stack`/`toolbox`/`pending-tools`/`suggest-stack`/checklist.
- `TodoItem`/`PlanView.jsx` (page `/projects/:id/plan`) restent **hors périmètre v5** — non touchés, peuvent afficher des icônes de repli pour les nouveaux types.

## Conventions

- **Migrations non destructives.** Base de prod = données réelles. On ajoute des colonnes, on copie les données en SQL dans la migration, on marque l'ancien champ `// DEPRECATED` dans le schéma. **Aucun `DROP` de colonne ou de table.** Toujours faire un `pg_dump` avant un déploiement qui inclut une migration.
- Chaque nouvelle migration Prisma met à jour `schema.prisma` en même temps (schéma et base restent synchronisés).
- Les requêtes applicatives passent par **knex**, jamais par le client Prisma généré.
- **Droits d'accès** : chaque route vérifie l'accès via `findProject(projectId, userId, isAdmin)` (`server/src/utils/projectHelpers.js`) — même pattern partout.
- **Prompts centralisés** dans `server/src/services/prompts/` (`agentPrompt.js`, `orchestratorPrompt.js`, `deliverablePrompts.js`). Aucune consigne d'agent ne doit être construite côté client.
- **Marqueurs d'agent** (`[DECISION:…]`, `[SUGGEST_AGENT:…]`, `[SUGGEST_MEETING:…]`, `[NEED_TOOL:…]`) parsés exclusivement via `server/src/services/markers.js#parseAgentOutput`.
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
