// Applique les migrations Prisma à la base de TEST, et à elle seule.
//   TEST_DATABASE_URL=postgresql://…/blabia_test npm run db:migrate:test
// Prisma lit DATABASE_URL, que server/.env fixe sur la PROD : ne jamais lancer
// « prisma migrate deploy » sans fixer DATABASE_URL explicitement (incident du 10/10/2026).
const { spawnSync } = require('child_process');

const url = process.env.TEST_DATABASE_URL || '';
if (!url || /rlwy\.net|railway/i.test(url) || !/\/[^/?]*test[^/?]*(\?|$)/i.test(url)) {
  console.error('TEST_DATABASE_URL doit désigner une base de TEST locale (nom contenant « test »), jamais la prod.');
  process.exit(1);
}
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: true, env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
