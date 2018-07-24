
exports.up = function(knex) {
  return knex.schema.createTable('question_state', t => {
    t.bigIncrements('id');
    t.bigInteger('assignment_id').unsigned().notNullable();
    t.bigInteger('question_id').unsigned().notNullable();
    t.bigInteger('lti_user_id').unsigned().notNullable();
    t.boolean('is_correct').notNullable();
    // Foreign keys
    t.foreign('lti_user_id').references('id').inTable('lti_user');
    t.foreign(['assignment_id', 'question_id']).references(['assignment_id', 'question_id']).inTable('assignment_questions');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('question_state');
};
