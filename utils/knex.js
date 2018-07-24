/**
 * A logger function that can be passed to knex to log all database queries.
 * @param {obejct} query The knex query object.
 */
function logger(query) {
  let message = query.sql;

  if (query.bindings) {
    query.bindings.forEach(binding => {
      message = message.replace('?', logValue(binding));
    });
  }

  if (!message.match(/;$/)) {
    message = message + ';';
  }

  console.log(`[Knex query] ${message}`);
}

/**
 * Transforms the received `value` to its string-like equivalent.
 * @param {*} value The initial value to log.
 * @returns {Sting} The stringified value.
 */
function logValue(value) {
  if (value === undefined) {
    return 'undefined';
  }

  if (value instanceof Buffer) {
    value = value.toString('hex');
  } else {
    value = JSON.stringify(value);
  }

  if (value.length > 50) {
    value = `${value.substring(0, 50)}...`;

    if (value.match(/^"/)) {
      value = `${value}"`;
    }
  }

  return value;
}

module.exports = { logger };