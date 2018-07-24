// Update with your config settings.

const config = require('./config');

module.exports = {

  development: {
    client: 'postgresql',
    connection: config.pgsql.admin
  },
  staging: {
    client: 'postgresql',
    connection: config.pgsql.admin
  },
  production: {
    client: 'postgresql',
    connection: config.pgsql.admin
  }

};
