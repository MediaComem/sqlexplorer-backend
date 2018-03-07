exports.mssql = {
  server: '',
  instanceName: '',
  username: '',
  password: '' // Change it when the user is created on the server
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