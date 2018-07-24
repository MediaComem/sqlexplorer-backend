
exports.up = function(knex) {
  return knex.schema.createTable('response', t => {
    t.bigIncrements('id');
    t.bigInteger('question_state_id').unsigned().notNullable().references('id').inTable('question_state');
    t.text('sql').notNullable();
    t.boolean('is_correct').notNullable();
    t.timestamp('submitted_at', true).notNullable();
  })
};

exports.down = function(knex) {
  return knex.schema.dropTable('response');
};
