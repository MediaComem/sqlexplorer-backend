
exports.up = function (knex) {
  return knex.schema.createTable('nonce_store', t => {
    t.bigIncrements('id').primary();
    t.string('value').unique();
    t.string('timestamp');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('nonce_store');
};
