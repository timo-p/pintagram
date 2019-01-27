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
          table.string('password').notNullable();
          table.string('salt').notNullable();
          table.timestamps();
        })
      )
      .then(() =>
        knex.schema.createTable('poems', (table) => {
          table.increments('id');
          table.text('line');
        })
      )
      .then(() => {
        const poems = require('../data/poems.json');
        const inserts = poems.map((line) => ({
          line
        }));
        return knex('poems').insert(inserts);
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
          table.integer('line_id').unsigned().notNull();
          table.foreign('username').references('users.username');
          table.foreign('line_id').references('poems.id');
          table.timestamps();
        });
      })
      .then(() => {
        return knex.schema.createTable('sessions', (table) => {
          table.string('id').primary();
          table.string('username').notNull().references('users.username');
          table.timestamps();
        });
      })
  ]);
};

exports.down = (knex) => {
  return knex.schema.dropTable('sessions')
    .then(() => knex.schema.dropTable('posts'))
    .then(() => knex.schema.dropTable('nouns'))
    .then(() => knex.schema.dropTable('adjectives'))
    .then(() => knex.schema.dropTable('poems'))
    .then(() => knex.schema.dropTable('users'))
    .then(() => knex.schema.dropTable('last_names'))
    .then(() => knex.schema.dropTable('first_names'));
};