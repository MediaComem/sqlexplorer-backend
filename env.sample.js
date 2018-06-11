exports.mssql = {
  server: '',
  instanceName: '',
  username: '',
  password: ''
};

exports.pgsql = {
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
};

exports.sentry = {
  dsn: 'sentry-dsn-value'
};
