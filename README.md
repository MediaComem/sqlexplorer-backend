# SQL Explorer backend

This is the backend for the [SQL Explorer](https://sqlexplorer.heig-vd.ch) application.

The previous README file can be found [here](OLD_README.md). You'll notably find there some basic information on the API endpoints.

This is an Express application, that connects to a PostgreSQL database (that contains the application data), along with several databases on an SQL Server (each of which represents an assignment subject).

The app is composed primarily of a single file [`server.js`](server.js) where almost all the routes and logic is written, with the exception of the LTI stuff (see below).

> The front-end for this app is available on [its own repository][sql-front].

## LTI

This application is compatible with the [LTI standard][lti], under its v1.1 version.

All LTI related code is found in the `lti` folder.

## Scripts

The [`package.json` file](package.json) lists the available script such as the dev script and those for deploying the app.

## Deployment

The deployment is done using the [`bash-deploy` plugin][bash-deploy] and the two files [`sqlexplorer.conf`](sqlexplorer.conf) and [`staging-sqlexplorer.conf`](staging-sqlexplorer.conf)
The [`ecosystem.config.js` file](ecosystem.config.js) is used by PM2 on the servers

## Check that everything's good

When deployed, you can make some very simple tests on the webapp to see if everything's all right:

* Go to https://sqlexplorer.heig-vd.ch` and check that you see something
* Write any SQL query for the displayed database and check that it returns something
* Write any wrong query and check that the error displayed is not something like `Internal Server Error 505`...
* Go to the admin page and check that the you can naviguate around
* You could also try to create a new assignment (though you'll need to remove it from the database afterward)

[sql-front]: https://github.com/MediaComem/sqlexplorer-frontend
[lti]: https://www.imsglobal.org/activity/learning-tools-interoperability
[bash-deploy]: https://www.npmjs.com/package/bash-deploy
