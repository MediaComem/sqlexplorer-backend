module.exports = {
  mssql: {
    server: '',
    instanceName: '',
    username: '',
    password: ''
  },
  pgsql: {
    user: {
      username: 'sqlexplorer',
      password: '',
      database: 'sqlexplorer-db',
      host: 'localhost',
      port: 5432
    },
    admin: {
      username: 'sqlexplorer_admin',
      password: '',
      database: 'sqlexplorer-db',
      host: 'localhost',
      port: 5432
    }
  },
  sentry: {
    dsn: 'sentry-dsn-value'
  },
  session: {
    secret: 'your-session-secret'
  }
};
