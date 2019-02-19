exports.up = (knex, Promise) => {
  return Promise.all([
    knex.schema.createTable('first_names', (table) => {
      table.string('first_name').notNullable().primary();
    })
      .then(() => {
        const names = require('../data/first_names.json');
        const inserts = names.map((name) => ({
          first_name: name
        }));
        return knex('first_names').insert(inserts);
      })
      .then(() =>
        knex.schema.createTable('last_names', (table) => {
          table.string('last_name').notNullable().primary();
        })
      )
      .then(() => {
        const names = require('../data/last_names.json');
        const inserts = names.map((name) => ({
          last_name: name
        }));
        return knex('last_names').insert(inserts);
      })
      .then(() =>
        knex.schema.createTable('users', (table) => {
          table.string('username').notNullable().primary();
          table.string('first_name').notNullable();
          table.string('last_name').notNullable();
          table.integer('posts').notNullable().defaultTo(0);
          table.string('password').notNullable();
          table.string('salt').notNullable();
          table.timestamps();
        })
      )
      .then(() =>
        knex.schema.createTable('lines', (table) => {
          table.increments('id');
          table.string('line');
          table.unique('line');
        })
      )
      .then(() => {
        const lines = require('../data/lines.json');
        const inserts = lines.map((line) => ({
          line
        }));
        return knex('lines').insert(inserts);
      })
      .then(() =>
        knex.schema.createTable('adjectives', (table) => {
          table.string('adjective');
        })
      )
      .then(() => {
        const adjectives = require('../data/adjectives.json');
        const inserts = adjectives.map((adjective) => ({
          adjective
        }));
        return knex('adjectives').insert(inserts);
      })
      .then(() =>
        knex.schema.createTable('nouns', (table) => {
          table.string('noun');
        })
      )
      .then(() => {
        const nouns = require('../data/nouns.json');
        const inserts = nouns.map((noun) => ({
          noun
        }));
        return knex('nouns').insert(inserts);
      })
      .then(() => {
        return knex.schema.createTable('posts', (table) => {
          table.increments('id');
          table.string('username');
          table.string('message').notNull();
          // table.integer('line_id').unsigned().notNull();
          table.foreign('username').references('users.username');
          table.foreign('message').references('lines.line');
          table.timestamps();
        });
      })
      .then(() => {
        return knex.schema.createTable('followers', (table) => {
          table.increments('id');
          table.string('username').notNull();
          table.string('following').notNull();
          table.foreign('username').references('users.username');
          table.foreign('following').references('users.username');
          table.unique(['username', 'following']);
          table.timestamps();
        });
      })
  ]);
};

exports.down = (knex) => {
  return knex.schema.dropTable('followers')
    .then(() => knex.schema.dropTable('posts'))
    .then(() => knex.schema.dropTable('nouns'))
    .then(() => knex.schema.dropTable('adjectives'))
    .then(() => knex.schema.dropTable('lines'))
    .then(() => knex.schema.dropTable('users'))
    .then(() => knex.schema.dropTable('last_names'))
    .then(() => knex.schema.dropTable('first_names'));
};