module.exports = {
  app: {
    port: 3000,
    rootUrl: 'https://root.url.of.your.backend.app',
    frontUrl: 'https://root.url.of.your.frontend.app',
    adminPassword: 'password-for-accessing-admin-routes'
  },
  mssql: {
    server: 'servername',
    instanceName: 'instancename',
    username: 'username',
    password: 'password'
  },
  pgsql: {
    user: {
      user: 'username',
      password: 'password',
      database: 'database', // Optional. Defaults to `user` value.
      host: 'hostname', // Optional. Defaults to localhost.
      port: 5432
    },
    admin: {
      user: 'admin_username',
      password: 'admin_password', // Optional. Defaults to `user` value.
      database: 'database', // Optional. Defaults to `user` value.
      host: 'hostname', // Optional. Defaults to localhost.
      port: 5432
    }
  },
  sentry: {
    dsn: 'sentry-dsn-value'
  },
  session: {
    secret: 'your-session-secret',
    name: 'your-cookie-name'
  }
}
