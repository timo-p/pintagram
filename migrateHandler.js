'use strict';

const db = require('./services/db');

const migrate = async (event) => {
  const action = event.action || 'migrate';
  let knex = db.getKnex(null);
  await knex.schema.raw('create database if not exists pintagram');
  await knex.destroy();
  knex = db.getKnex('pintagram', {
    tableName: 'migrations',
    directory: './migrations',
  });
  let result;
  if (action === 'rollback') {
    result = await knex.migrate.rollback();
    /*
    await db.destroy();
    db = getDb();
    await db.schema.raw('drop database pintagram');
    */
  } else {
    result = await knex.migrate.latest();
  }
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};

module.exports = {
  migrate,
};