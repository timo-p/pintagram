'use strict';

const knex = require('knex');

const getKnex = (database = 'pintagram', migrations) => {
  const db = knex({
    client: 'mysql',
    connection: {
      host: process.env.DB_URL,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database,
      migrations,
    },
  });
  db.on('query', (data) => {
    console.log(data.sql, data.bindings); // eslint-disable-line no-console
  });
  return db;
};

module.exports = {
  getKnex,
};