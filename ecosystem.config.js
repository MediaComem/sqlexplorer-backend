module.exports = {
  apps: [
    {
      // SQL Explorer - production app configuration
      name: "sqlexplorer",
      script: "/var/www/sqlexplorer/current/server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        NODENV_VERSION: "8.10.0",
        PATH: `/home/sqlexplorer/.nodenv/shims:${process.env.PATH}`
      },
      restart_delay: 10000,
      max_restarts: 500
    }, {
      // SQL Explorer - staging app configuration
      name: "staging-sqlexplorer",
      script: "/var/www/staging-sqlexplorer/current/server.js",
      watch: false,
      env: {
        NODE_ENV: "staging",
        NODENV_VERSION: "8.10.0",
        PATH: `/home/sqlexplorer/.nodenv/shims:${process.env.PATH}`
      },
      restart_delay: 10000,
      max_restarts: 500
    }
  ]
};
