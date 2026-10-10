// Lance les tests d'intégration (src/__integration__) sur une base de TEST locale.
//   TEST_DATABASE_URL=postgresql://…/blabia_test npm run test:integration
// La base doit exister et être migrée (prisma migrate deploy avec DATABASE_URL = cette base).
const { spawnSync } = require('child_process');

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL manquant (ex. postgresql://postgres:<mot de passe>@localhost:5432/blabia_test).');
  process.exit(1);
}
const r = spawnSync('npx', ['vitest', 'run', 'src/__integration__'], { stdio: 'inherit', shell: true, env: process.env });
process.exit(r.status ?? 1);
