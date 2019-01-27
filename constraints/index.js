
const knex = require('../services/db').getKnex();

const posts = async () => {
  const lineIds = await knex('poems').pluck('id');

  return {
    line_id: {
      presence: true,
      inclusion: {
        within: lineIds,
      }
    }
  };
};

module.exports = {
  posts,
};