
exports.up = function (knex) {
  return knex.schema.createTable('lti_consumers', t => {
    t.bigIncrements('id').primary();
    t.string('key').unique();
    t.string('secret');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('lti_consumers');
};
