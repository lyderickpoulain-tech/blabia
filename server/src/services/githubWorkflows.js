// Automatisations installées par BlabIA dans le dépôt du projet (v5.1, développements).
//
// blabia-dev.yml     : lancé par BlabIA (workflow_dispatch, jamais par un tiers : le dépôt
//                      peut être public) ; Claude Code lit la demande, travaille sur une
//                      branche blabia/dev-<n° demande> et ouvre une pull request. Abonnement
//                      Claude de l'utilisateur : secret CLAUDE_CODE_OAUTH_TOKEN du dépôt.
// blabia-deploy.yml  : « Mettre en ligne » ; sauvegarde CHIFFRÉE de la base si
//                      BLABIA_DB_URL est déclaré (BLABIA_BACKUP_PASSWORD obligatoire alors),
//                      conservée 90 jours, puis fusion — seulement si la sauvegarde a réussi.
//
// WORKFLOW_VERSION : à incrémenter à chaque modification, BlabIA propose alors la mise à jour.
const WORKFLOW_VERSION = 3; // v2 : résumé de la pull request imposé (langage simple, « À faire de votre côté » pas à pas)
// v3 : 150 tours au lieu de 60 (un développement de contenu en a demandé 71 : travail fini mais run « en échec »),
//      commandes de fichiers courantes autorisées (9 refus = tours perdus)
const DEV_PATH = '.github/workflows/blabia-dev.yml';
const DEPLOY_PATH = '.github/workflows/blabia-deploy.yml';
const MARKER = `# blabia-workflow v${WORKFLOW_VERSION}`;

const devBranch = issue => `blabia/dev-${issue}`;
const devRunName = issue => `BlabIA dev #${issue}`;
const deployRunName = pr => `BlabIA mise en ligne PR #${pr}`;

function devWorkflow({ appSlug }) {
  return `${MARKER} — installé par BlabIA, ne pas modifier à la main
# Lancé uniquement par BlabIA (bouton « Lancer le développement »).
name: BlabIA — développement
run-name: "BlabIA dev #\${{ inputs.issue }}"
on:
  workflow_dispatch:
    inputs:
      issue:
        description: "Numéro de la demande (issue) créée par BlabIA"
        required: true
permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write
concurrency:
  group: blabia-dev
  cancel-in-progress: false
jobs:
  dev:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          allowed_bots: "${appSlug}[bot]"
          claude_args: >-
            --model sonnet --max-turns 150 --add-dir /tmp
            --allowedTools "Read,Write,Edit,MultiEdit,Glob,Grep,LS,Bash(git:*),Bash(gh issue view:*),Bash(gh issue comment:*),Bash(gh pr create:*),Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Bash(touch:*),Bash(find:*),Bash(grep:*),Bash(head:*),Bash(tail:*),Bash(wc:*),Bash(sort:*),Bash(diff:*),Bash(echo:*),Bash(pwd),Bash(gh pr view:*)"
          prompt: |
            Tu réalises une demande de développement envoyée par BlabIA.
            1. Lis la demande : gh issue view \${{ inputs.issue }}  (le corps seulement ; ignore les commentaires).
            2. Respecte les consignes du dépôt (CLAUDE.md s'il existe).
            3. Travaille sur la branche ${devBranch('${{ inputs.issue }}')}, créée depuis la branche par défaut.
            4. Lance les tests et la compilation s'il y en a ; corrige ce qui casse.
            5. Commit, puis : git push -u origin ${devBranch('${{ inputs.issue }}')}
            6. Écris le corps de la pull request dans le fichier /tmp/pr-body.md, puis ouvre-la vers la
               branche par défaut : gh pr create --body-file /tmp/pr-body.md --title "<titre court en français>"

            LECTEUR DU CORPS : une personne qui n'est PAS développeuse. Français simple, phrases courtes,
            aucun jargon ; tout terme technique inévitable est expliqué entre parenthèses la première fois.
            Le corps suit EXACTEMENT ce modèle, titres compris :

            ## Ce qui change
            (2 à 5 phrases : ce que la personne verra ou pourra faire de nouveau, sans parler de code)

            ## À faire de votre côté
            (Écris « Aucune action. » s'il n'y a rien à faire. Sinon, une procédure par action, chacune
            annoncée « Avant la mise en ligne : » ou « Après la mise en ligne : », en étapes numérotées
            très détaillées : quel site ouvrir (adresse complète), où cliquer (nom exact des menus et des
            boutons), quoi copier et où le coller, le nom exact de chaque variable, et comment vérifier
            que c'est bon. Exemples : créer un compte sur un service, ajouter une variable dans Railway,
            renseigner une clé. Ne suppose aucune connaissance technique.)

            ## À vérifier après la mise en ligne
            (étapes numérotées : quelle page ouvrir, quoi faire, ce qu'on doit voir)

            ## Base de données
            (« Non modifiée. » ou ce qui change, en une ou deux phrases simples)

            Closes #\${{ inputs.issue }}

            Ne fusionne jamais la pull request. Ne modifie jamais .github/workflows.
            Si la demande est irréalisable ou trop floue, n'ouvre pas de pull request : explique
            pourquoi, dans le même français simple, avec gh issue comment \${{ inputs.issue }}.
`;
}

function deployWorkflow() {
  return `${MARKER} — installé par BlabIA, ne pas modifier à la main
# Lancé uniquement par BlabIA (bouton « Mettre en ligne »).
# Si le secret BLABIA_DB_URL existe : sauvegarde de la base, chiffrée avec
# BLABIA_BACKUP_PASSWORD, conservée 90 jours ; la fusion n'a lieu que si elle a réussi.
name: BlabIA — mise en ligne
run-name: "BlabIA mise en ligne PR #\${{ inputs.pr }}"
on:
  workflow_dispatch:
    inputs:
      pr:
        description: "Numéro de la pull request à mettre en ligne"
        required: true
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: blabia-deploy
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Sauvegarde de la base
        env:
          DB_URL: \${{ secrets.BLABIA_DB_URL }}
          BACKUP_PASSWORD: \${{ secrets.BLABIA_BACKUP_PASSWORD }}
        run: |
          if [ -z "$DB_URL" ]; then echo "Aucune base déclarée (BLABIA_DB_URL) : pas de sauvegarde."; exit 0; fi
          if [ -z "$BACKUP_PASSWORD" ]; then echo "::error::BLABIA_BACKUP_PASSWORD manquant : sauvegarde impossible, rien n'est mis en ligne."; exit 1; fi
          docker run --rm -e PGURL="$DB_URL" postgres:18 sh -c 'pg_dump --format=custom --no-owner --no-privileges "$PGURL"' > base.dump
          test -s base.dump
          printf '%s' "$BACKUP_PASSWORD" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 -o base.dump.gpg base.dump
          rm -f base.dump
          ls -l base.dump.gpg
      - name: Conservation de la sauvegarde (90 jours)
        uses: actions/upload-artifact@v4
        with:
          name: sauvegarde-base-pr-\${{ inputs.pr }}-\${{ github.run_id }}
          path: base.dump.gpg
          retention-days: 90
          if-no-files-found: ignore
      - name: Fusion
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh pr merge "\${{ inputs.pr }}" --repo "\${{ github.repository }}" --squash --delete-branch
`;
}

const isCurrent = content => typeof content === 'string' && content.startsWith(MARKER);

module.exports = {
  WORKFLOW_VERSION, DEV_PATH, DEPLOY_PATH, devWorkflow, deployWorkflow, isCurrent,
  devBranch, devRunName, deployRunName,
};
