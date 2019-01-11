const knex = require('../../config').knexDb;

function getSolution(questionId) {
  return knex('questions')
    .select('sql')
    .where('id', questionId)
    .then(result => result[0].sql);
}

module.exports = { getSolution };