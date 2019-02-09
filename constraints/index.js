
const knex = require('../services/db').getKnex();

const posts = async () => {
  const lines = await knex('poems').pluck('line');

  return {
    message: {
      presence: true,
      inclusion: {
        within: lines,
      }
    }
  };
};

module.exports = {
  posts,
};