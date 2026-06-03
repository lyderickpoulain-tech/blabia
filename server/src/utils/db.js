const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 1,
    max: 10,
    afterCreate: (conn, done) => {
      conn.query('SET client_encoding TO UTF8', (err) => done(err, conn));
    }
  }
});

module.exports = db;
