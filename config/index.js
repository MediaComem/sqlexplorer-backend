const knex = require('knex');

const { logger: knexLogger } = require('../utils/knex');
const env = process.env.NODE_ENV || 'local';

console.log(`[Configuration] Loading configuration for environment '${env}'`);

const config = require(`./env.${env}.js`);

config.knexDb = knex({
  client: 'postgres',
  connection: config.pgsql.user
});

// Log the query that is executed by Knex expressions.
config.knexDb.on('query', knexLogger);

module.exports = config;
