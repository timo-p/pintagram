
const knex = require('../services/db').getKnex();

const posts = async () => {
  const lines = await knex('lines').pluck('line');

  return {
    message: {
      presence: true,
      inclusion: {
        within: lines,
      }
    }
  };
};

const follow = async () => {
  return {
    follow: {
      presence: true,
    }
  };
};

module.exports = {
  posts,
  follow,
};