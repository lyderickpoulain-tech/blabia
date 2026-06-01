const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('../utils/db');

async function seedAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node src/scripts/seed-admin.js <email> <password>');
    process.exit(1);
  }

  const [existing] = await db('User').where({ email }).limit(1);
  if (existing) {
    if (existing.role === 'admin') {
      console.log(`Admin déjà existant : ${email}`);
    } else {
      await db('User').where({ email }).update({ role: 'admin' });
      console.log(`Rôle admin attribué à : ${email}`);
    }
    await db.destroy();
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await db('User').insert({ id: randomUUID(), email, password: hashed, role: 'admin' });
  console.log(`Admin créé : ${email}`);
  await db.destroy();
}

seedAdmin().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
