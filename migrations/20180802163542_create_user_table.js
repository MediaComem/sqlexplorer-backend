const { addTouchColumnsOn } = require('../utils/migrations');

exports.up = function (knex) {
  return knex.schema.createTable('lti_user', t => {
    t.bigIncrements('id').primary();
    t.string('tc_user_id').notNullable();
    t.string('image');
    t.string('firstname').notNullable();
    t.string('lastname').notNullable();
    t.timestamp('last_access', true).notNullable();
    // created_at and updated_at
    addTouchColumnsOn(t);
    // Foreign key
    t.bigInteger('lti_tc_id').unsigned().notNullable().references('id').inTable('lti_consumers');
    // Constraints
    t.unique(['tc_user_id', 'lti_tc_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('lti_user');
};
