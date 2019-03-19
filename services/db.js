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

const getKnexAndCheckConnection = () => {
  return new Promise(async (resolve) => {
    try {
      const knex = getKnex();
      await knex.raw('select now()').then().catchThrow();
      resolve(knex);
    } catch(e) {
      console.log(`Caught error. Retrying after 1000ms. Error: ${e}`); // eslint-disable-line no-console
      const waiter = new Promise((waitResolve) => {
        setTimeout(() => waitResolve(), 1000);
      });
      await waiter;
      return getKnexAndCheckConnection();
    }
  });

};

module.exports = {
  getKnex,
  getKnexAndCheckConnection,
};