exports.addTouchColumnsOn = function (table) {
  table.timestamp('created_at', true).notNullable().index();
  table.timestamp('updated_at', true).notNullable().index();
};