const express = require('express');
const bodyParser = require('body-parser');
const Pool = require('pg').Pool;
// const oracledb = require('oracledb');
const mssql = require('mssql');
const app = express();
const cors = require('cors');
// const basicAuth = require('basic-auth-connect');
// const xmlBuilder = require('xmlbuilder');
// const AdmZip = require('adm-zip');
const exec = require("child_process").exec;
const tmp = require('tmp');
const Raven = require('raven');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
// const reduce = require('object.reduce');
const ltiRouter = require('./lti/router');
const path = require('path');
const logger = require('morgan');
// const { transform } = require('lodash');
const { get } = require('lodash');
const config = require('./config');
const TediousConnectionPool = require('tedious-connection-pool');
const tedious = require('tedious');

const pgUserConfig = {
  user: config.pgsql.user.user,
  password: config.pgsql.user.password,
  host: config.pgsql.user.host || 'localhost',
  port: config.pgsql.user.port || 5432,
  database: config.pgsql.user.database
}

const pgAdminConfig = {
  user: config.pgsql.admin.user,
  password: config.pgsql.admin.password,
  host: config.pgsql.admin.host || 'localhost',
  port: config.pgsql.admin.port || 5432,
  database: config.pgsql.admin.database
}

// const pgConString = `postgres://${config.pgsql.user.user}:${config.pgsql.user.password}@${config.pgsql.user.host || 'localhost'}:${config.pgsql.user.port || 5432}/${config.pgsql.user.database}`;
// const pgConAdminString = `postgres://${config.pgsql.admin.user}:${config.pgsql.admin.password}@${config.pgsql.admin.host || 'localhost'}:${config.pgsql.admin.port || 5432}/${config.pgsql.admin.database}`;

const pgPool = new Pool(pgUserConfig);
// const pgPool = new Pool({ connectionString: pgConString });
const pgAdminPool = new Pool(pgAdminConfig);
// const pgAdminPool = new Pool({ connectionString: pgConAdminString });

Raven.config(config.sentry.dsn).install();

// Express settings

// Mandatory so that Express can access the initial request data instead of only the proxy request data.
app.enable('trust proxy');
// Used when generating template for LTI Item Selection Requests.
app.set('view engine', 'pug');
// Fix a bug where Express was not searching the templates in the correct directory.
app.set('views', path.join(__dirname, '/views'));

app.use(Raven.requestHandler());
app.use(Raven.errorHandler());
app.use(logger('dev'));

pgPool.on('error', err => Raven.captureException(err));
pgAdminPool.on('error', err => Raven.captureException(err));

passport.use(new BasicStrategy(
  function(username, password, done) {
    if (username === 'admin' && password === config.app.adminPassword) {
      done(null, true);
    } else {
      done(null, false);
    }
  }
));

app.use(cors({
  origin: true, //  reflect the request origin, as defined by req.header('Origin')
  credentials: true
}));
app.use(express.static(path.join(__dirname, '/public')));
app.use('/schema_pics', express.static(path.join(__dirname, '/schema_pics')));
app.use('/assets', express.static(path.join(__dirname, '/views/assets')));
app.use(passport.initialize());

const jsonParser = bodyParser.json();
// const txtParser = bodyParser.text();
// const urlencodedParser = bodyParser.urlencoded({ extended: false });

app.use('/lti', ltiRouter);

app.post('/api/evaluate', jsonParser, function(req, res) {
  console.log(req.body);
  //if (!req.body.db || !req.body.sql) return res.sendStatus(400);
  // create user in req.body
  query(req, res);
});

//"regexp_replace(regexp_replace(substring(%s.sql from '^SELECT *(?:DISTINCT)? *(.*?) *FROM.*?'), ',[^,]*?AS ',', ','g'), '^[^,]*?AS', '', 'g')"
//regexp_replace(regexp_replace(substring(sql from '^SELECT *(?:DISTINCT)? *(.*?) *FROM.*?'), ', .*? AS ',', ','gs'), '^.*? AS ', '', 'gs')

app.get('/api/questiontext/:id', function(req, res) {
  pgPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query('SELECT * FROM question_schemas WHERE id = $1',
      [ req.params.id ], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
          res.sendStatus(500);
        }
        if (result.rows.length > 0) {
          res.send(JSON.stringify(result.rows[ 0 ]));
        } else {
          res.sendStatus(404);
        }
        done();
      });
  });
});

app.get('/api/question/:id',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    //TODO check admin
    pgPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return;
      }
      client.query('SELECT q.*, qv.schema FROM questions q JOIN question_schemas qv ON qv.id = q.id  WHERE q.id = $1',
        [ req.params.id ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[ 0 ]));
          } else {
            res.sendStatus(404);
          }
          res.end();
          done();
        });
    });
  }
);

app.post('/api/question', jsonParser,
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    if (!req.body) return res.sendStatus(400);
    console.log(req.body);
    upsertQuestion(req, res);
  }
);

app.get('/api/logs',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
      }
      client.query(`SELECT json_agg(row_to_json(t)) AS json
        FROM (
          SELECT user_name, user_id, json_agg((SELECT row_to_json( _ ) FROM (SELECT activity as name, questions) _ )) as activities
          FROM (
            SELECT user_name, user_id, activity, json_agg((SELECT row_to_json( _ ) FROM (SELECT question_id as id, count) _ )) AS questions
            FROM (
              SELECT user_id, user_name, activity, question_id, COUNT(*) AS count
              FROM logs
              GROUP BY user_id, user_name, activity, question_id
              ORDER BY user_name, user_id, activity, question_id
            ) a
            GROUP BY  user_name, user_id, activity
          ) b
          GROUP BY user_name, user_id
        ) t`,
        function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[ 0 ].json));
            res.end();
          } else {
            res.sendStatus(404);
          }
          done();
        });
    });
  }
);

app.get('/api/logs/:user_id',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return;
      }
      client.query(`
        SELECT activity, question_id, COUNT(*), json_agg((SELECT row_to_json(_) FROM (SELECT query, error, created, ip) _ )) AS attempts
        FROM logs
        WHERE user_id LIKE $1 || \'%\'
        GROUP BY activity, question_id
        ORDER BY activity, question_id`,
        [ req.params.user_id ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows));
            res.end();
          } else {
            res.sendStatus(404);
          }
          done();
        });
    });
  }
);

app.get('/api/tags',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgAdminPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return;
      }
      client.query(`
        SELECT name, Count(q.id) AS nb
        FROM keywords k
        LEFT JOIN questions q ON lower(q.sql) LIKE  '%' || lower(k.name) || '%'
        GROUP BY name
        ORDER BY name`,
        function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows));
            res.end();
          } else {
            res.sendStatus(404);
          }
          done();
        });
    });
  }
);

app.get('/api/assignment/list',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgAdminPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return;
      }
      client.query(`
        SELECT a.id, a.name, a.year, a.course, a.description, COUNT(aq.assignment_id) AS nb
        FROM assignments a
        LEFT JOIN assignment_questions aq ON a.id = aq.assignment_id
        GROUP BY a.id, a.name, a.year, a.course, a.description
        ORDER BY a.year DESC, a.course ASC, a.name ASC`,
        function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          res.write(JSON.stringify(result.rows));
          res.end();
          done();
        });
    });
  }
);

app.get('/api/assignment/:id',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    getAssignmentQuestions(req.params.id, function(err, result) {
      if (err) {
        console.error('error running query', err);
        Raven.captureException(err);
        res.sendStatus(500);
      } else {
        res.write(JSON.stringify(result.rows));
      }
      res.end();
    });
  }
);

function getAssignmentQuestions(id, callback) {
  pgAdminPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query("SELECT * FROM assignment_questions aq JOIN questions q ON q.id = question_id WHERE aq.assignment_id = $1 ORDER BY aq.aq_order",
      [ id ],
      function(err, result) {
        callback(err, result);
        done();
      });
  });
}

function getAssignementById(id, callback) {
  pgAdminPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query("SELECT * FROM assignments WHERE id = $1",
      [ id ],
      function(err, result) {
        callback(err, result);
        done();
      });
  });
}

app.post('/api/assignment', jsonParser,
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgAdminPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        res.sendStatus(500);
        return;
      }
      client.query('INSERT INTO assignments (name, year, course) VALUES ($1, $2, $3) RETURNING id',
        [ req.body.name, req.body.year, req.body.course ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.send(JSON.stringify(result.rows[ 0 ]));
          }
          done();
        });
    });
  }
);

app.post('/api/assignment/:assignmentId/question', jsonParser,
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    pgAdminPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return res.sendStatus(500);
      }
      client.query('INSERT INTO assignment_questions (assignment_id, question_id, aq_order) VALUES ($1, $2, (SELECT COUNT(*) FROM assignment_questions WHERE assignment_id = $1))',
        [ req.params.assignmentId, req.body.questionId ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          } else {
            res.sendStatus(200);
          }
          done();
        });
    });
  }
);

app.post('/api/questions', jsonParser,
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    if (!req.body) return res.sendStatus(400);
    pgAdminPool.connect(function(err, client, done) {
      if (err) {
        console.error('error fetching client from pool', err);
        Raven.captureException(err);
        return res.sendStatus(500);
      }
      const keywords = req.body.keywords || [];
      const dbname = (req.body.dbname || 'ALL').toUpperCase();
      const andOr = req.body.inclusive === '1' ? 'OR' : 'AND';

      let sql = `SELECT t.id, t.text, t.sql, t.db_schema, json_agg(keyword) AS keywords
        FROM (
          SELECT q.id, q.text, q.sql, q.db_schema, k.name AS keyword
          FROM questions q
          JOIN keywords k ON lower(q.sql) LIKE  '%' || lower(k.name) || '%'`;

      if (dbname !== 'ALL') {
        sql += 'WHERE UPPER(q.db_schema) = $' + (keywords.length + 1);
      }

      sql += ` ORDER BY keyword, sql
        ) t
        GROUP BY t.id, t.text, t.sql, t.db_schema`;

      if (keywords.length > 0) {
        sql += ' HAVING ';
        keywords.forEach(function(keywords, i) {
          if (i > 0) {
            sql += andOr;
          }
          sql += ' $' + (i + 1) + ' = ANY(array_agg(keyword)) ';
        });
      }
      sql += ' ORDER BY db_schema LIMIT 100';
      if (dbname !== 'ALL') {
        keywords.push(dbname);
      }
      client.query(sql, keywords,
        function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            return res.sendStatus(500);
          }
          if (result.rows) {
            res.send(JSON.stringify(result.rows));
          } else {
            res.sendStatus(404);
          }
          done();
        });
    });

  });

app.get('/api/db/list', function(req, res) {
  getDBList(req, res);
});

//used for wwwsqldesigner
app.get('/api/db/:dbname', function(req, res) {
  exportDBSchema(req, res, req.params.dbname);
});

//export sql sol to pdf
app.get('/api/pdf/:id', function(req, res) {
  getAssignementById(req.params.id, function(assignment_err, assignment) {
    getAssignmentQuestions(req.params.id, function(err, result) {
      tmp.tmpName(function _tempNameGenerated(err, path) {
        if (err) throw err;
        exec('php sql_to_pdf.php ' + path + ' "' + assignment.rows[ 0 ].name + '" "' + JSON.stringify(result.rows).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', { cwd: 'sql_to_pdf' }, function(error, stdout, stderr) {
          res.setHeader('Content-type', 'application/pdf');
          res.setHeader('Content-disposition', 'attachment; filename=' + assignment.rows[ 0 ].name + '.pdf');
          res.sendFile(path);
        });
      });
    });
  });
});

const mssqlConfig = {
  user: config.mssql.username,
  password: config.mssql.password,
  server: config.mssql.server + (config.mssql.instanceName ? "\\" + config.mssql.instanceName : "")
};

const tediousConfig = {
  userName: config.mssql.username,
  password: config.mssql.password,
  server: config.mssql.server,
  options: {
    instanceName: config.mssql.instanceName,
    rowCollectionOnRequestCompletion: true
  }
};

const tediousPool = new TediousConnectionPool({}, tediousConfig);

tediousPool.on('error', function(err) {
  console.error('Tedious Pool Error', err);
});

startApplication(() => {
  tediousPool.acquire((err, connection) => {
    if (err) return console.log('Tedious Pool Acquisition Error', err);
    const request = new tedious.Request('SELECT 1 + 2 AS n', (err, rowCount, rows) => {
      if (err) return console.log('Tedious Pool Request Error', err);
      if (rows[0][0].value === 3) {
        console.log('Tedious Connected!');
      }
      connection.release();
    });

    connection.execSql(request);
  });
});

function query(req, res) {
  let schema = req.body.db.replace(/[^a-z_0-9]/gi, '').toUpperCase();
  let userResultsMetadata, answerResultsMetadata;

  tediousPool.acquire((err, connection) => {
    if (err) {
      console.log('Error acquiring connection', err);
      Raven.captureException(err);
      return res.sendStatus(500);
    }

    // Connection done !

    connection.beginTransaction((err) => {
      if (err) {
        console.log('Error begining the transaction', err);
        Raven.captureException(err);
        connection.release();
        return res.sendStatus(500);
      }

      // Transaction started !

      const switchToDatabase = new tedious.Request(`USE ${schema};`, (err, rowCount, rows) => {
        if (err) {
          console.log('Error connecting to db:', err);
          Raven.captureException(err);
          connection.rollbackTransaction(() => connection.release());
          return res.sendStatus(500);
        }

        // Switched to the database !

        if (!req.body.sql) {
          connection.rollbackTransaction(() => connection.release());
          return res.sendStatus(400);
        }

        const sqlToTest = req.body.sql.replace(/;/g, '');
        const data = {
          headers: [],
          content: [],
          numrows: 0
        };

        const testSqlToTest = new tedious.Request(sqlToTest, (err, rowCount, result) => {
          if (err) {
            console.log('Error executing user query:', err);
            Raven.captureException(err);
            connection.rollbackTransaction(() => connection.release());
            return res.send(JSON.stringify({ error: err.toString() }));
          }

          // User request executed

          if (result.length > 0) {
            data.content = result.slice(0, 1000).map(function(row) {
              return row.map(column => {
                return column.value === null ? '(NULL)' : column.value;
              });
            });
            data.numrows = result.length;
          }

          // If the request is an answer to a question...
          if (req.body.id) {
            getQuestionByID(req.body.id, question => {
              if (!Boolean(question)) {
                console.log('Error fetching the question: no question for this id');
                connection.rollbackTransaction(() => connection.release());
                return res.sendStatus(404);
              }
              const sqlAnswer = question.sql;

              const sqlAnswerRequest = new tedious.Request(sqlAnswer, (err, rowCount, resultAnswer) => {
                if (err) {
                  console.log('Error executing query sqlAnswer:', err);
                  Raven.captureException(err);
                  connection.rollbackTransaction(() => connection.release());
                  return res.sendStatus(500);
                }

                // Check that both result sets have the same row length
                if (result.length !== resultAnswer.length) {
                  sendAnswer(false, 'Vérifier conditions et/ou schéma.');
                  // Check that both result sets have the same column length
                } else if (userResultsMetadata.length !== answerResultsMetadata.length) {
                  sendAnswer(false, 'Vérifier SELECT.');
                } else {
                  // Check that the union of both requests does not yield any result
                  const sanitizedSqlToTest = sqlToTest.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '');
                  const sanitizedSqlAnswer = sqlAnswer.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '');
                  const sqlSets = `(${sanitizedSqlAnswer} EXCEPT ${sanitizedSqlToTest}) UNION (${sanitizedSqlToTest} EXCEPT ${sanitizedSqlAnswer})`;

                  const sqlSetsRequest = new tedious.Request(sqlSets, (err, rowCount, rows) => {
                    if (err) {
                      sendAnswer(false, `Erreur de vérification : ${err.message}`);
                    } else if (rowCount !== 0) {
                      sendAnswer(false, 'Pas la bonne réponse...');
                    } else {
                      // Check that the values of each set are in the same order
                      let orderError = false;
                      if (sqlAnswer.toUpperCase().match(/ORDER\s+BY/)) {
                        orderError = resultAnswer.some((answerRow, rowIndex) => {
                          return answerRow.some((answerColumn, columnIndex) => {
                            const userRequestValue = result[rowIndex][columnIndex].value;
                            if (get(answerColumn, ['value', 'constructor'], null) === Date) {
                              return answerColumn.value.getTime() !== userRequestValue.getTime()
                            } else {
                              return answerColumn.value !== userRequestValue;
                            }
                          });
                        });
                      }
                      orderError ? sendAnswer(false, 'Vérifier ordre.') : sendAnswer(true, sqlAnswer);
                    }
                  });
                  connection.execSql(sqlSetsRequest);
                }
              });
              sqlAnswerRequest.on('columnMetadata', columns => answerResultsMetadata = columns);
              connection.execSql(sqlAnswerRequest);
            });
          } else {
            sendAnswer();
          }
        });

        // Get the metadata from the results
        testSqlToTest.on('columnMetadata', columns => {
          userResultsMetadata = columns;
          data.headers = columns.map(column => {
            return column.colName;
          });
        });

        connection.execSql(testSqlToTest);

        /**
         * Send a response with the state of the user answer is correct.
         * This also rollback the initiated transaction and release the connection.
         * @param {Boolean} correct Indicates wether or not the user answer is correct.
         * @param {String} msg An optionnal message to be sent to the front-end.
         */
        function sendAnswer(correct, msg) {

          if (typeof (correct) !== 'undefined') {
            data.correct = correct;
          }
          if (data.correct) {
            data.answer = msg;
          } else if (typeof (msg) !== 'undefined') {
            data.error = msg;
          }

          // No need to commit the transaction since it only should have been SELECTs.
          connection.rollbackTransaction(() => connection.release());
          return res.json(data);
        }

      });

      connection.execSql(switchToDatabase);
    });

  });

  // new mssql.ConnectionPool(mssqlConfig).connect()
  //   .then(pool => {
  //     const transaction = pool.transaction();
  //     transaction.begin(err => {
  //       if (err) {
  //         console.log('Error connecting to db:', err);
  //         pool.close();
  //         Raven.captureException(err);
  //         return res.sendStatus(500);
  //       }
  //       transaction.request().query(`USE ${schema};`, (err, result) => {
  //         if (err) {
  //           console.log('Error executing query:', err);
  //           pool.close();
  //           Raven.captureException(err);
  //           return res.sendStatus(500);
  //         }

  //         if (!req.body.sql) {
  //           transaction.rollback().then(() => pool.close());
  //           return res.sendStatus(404);
  //         }

  //         const sqlToTest = req.body.sql.replace(/;/g, '');

  //         transaction.request().query(sqlToTest, (err, result) => {
  //           const data = {
  //             headers: [],
  //             content: [],
  //             numrows: 0
  //           };

  //           function answer(correct, msg) {
  //             const log = {
  //               activity: schema,
  //               question_id: undefined,
  //               query: req.body.sql,
  //               error: undefined,
  //               user_id: undefined,
  //               user_name: undefined,
  //               ip: req.headers[ 'x-forwarded-for' ] || req.connection.remoteAddress
  //             };

  //             if (typeof (correct) !== 'undefined') {
  //               data.correct = log.correct = correct;
  //             }
  //             if (data.correct) {
  //               data.answer = msg;
  //             } else {
  //               if (typeof (msg) !== 'undefined') {
  //                 data.error = log.error = msg;
  //               }
  //             }
  //             if (req.body.id) {
  //               log.question_id = req.body.id;
  //             }
  //             if (req.body.user_id) {
  //               log.user_id = req.body.user_id;
  //             }
  //             if (req.body.user_name) {
  //               log.user_name = req.body.user_name;
  //             }

  //             logAnswer(log);

  //             transaction.commit().then(() => { pool.close(); });
  //             res.json(data);
  //           }

  //           if (err) {
  //             transaction.rollback().then(() => { pool.close(); });
  //             res.send(JSON.stringify({ error: err.toString() }));
  //           } else {
  //             if (result.recordset.length > 0) {
  //               reduce(result.recordset.columns, (acc, value) => {
  //                 acc.push(value.name);
  //                 return acc;
  //               }, data.headers);
  //               data.content = result.recordset.slice(0, 1000).map(function(row) {
  //                 Object.keys(row).forEach(key => {
  //                   if (row[ key ] === null) { row[ key ] = '(NULL)'; }
  //                 });
  //                 return row;
  //               });
  //               data.numrows = result.recordset.length;
  //             }

  //             if (req.body.id) {
  //               getQuestionByID(req.body.id, question => {
  //                 const sqlAnswer = question.sql;
  //                 transaction.request().query(sqlAnswer.replace(/;/g, ''), (err, resultAnswer) => {
  //                   if (err) {
  //                     console.log('Error executing query sqlAnswer:', err);
  //                     transaction.rollback().then(() => { pool.close(); });
  //                     Raven.captureException(err);
  //                     return res.sendStatus(500);
  //                   }
  //                   if (result.recordset.length === resultAnswer.recordset.length) {
  //                     if (Object.keys(result.recordset.columns).length !== Object.keys(resultAnswer.recordset.columns).length) {
  //                       answer(false, 'vérifier select');
  //                     } else {
  //                       const sqlSets = `
  //                       (${sqlAnswer.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')} EXCEPT ${sqlToTest.toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')})
  //                       UNION
  //                       (${sqlToTest.toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')} EXCEPT ${sqlAnswer.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')})
  //                     `;

  //                       transaction.request().query(sqlSets, (err, resultsSets) => {
  //                         if (err) {
  //                           answer(false, 'erreur de vérification: ' + err.message);
  //                         } else if (resultsSets.recordset.length > 0) {
  //                           answer(false, 'pas la bonne réponse');
  //                         } else {
  //                           let orderError = false;
  //                           if (sqlAnswer.toUpperCase().match(/ORDER\s+BY/)) {
  //                             let i = 0;
  //                             while (!orderError && i < resultAnswer.recordset.length) {
  //                               Object.keys(resultAnswer.recordset[ i ]).some(key => {
  //                                 key = key.toLowerCase();
  //                                 // This is necessary when column names have differente cases.
  //                                 const currentRecordAnswer = transform(resultAnswer.recordset[ i ], (acc, value, key) => {
  //                                   acc[ key.toLowerCase() ] = value;
  //                                 });
  //                                 const a = currentRecordAnswer[ key ];
  //                                 const currentRecordResponse = transform(result.recordset[ i ], (acc, value, key) => {
  //                                   acc[ key.toLowerCase() ] = value;
  //                                 });
  //                                 const b = currentRecordResponse[ key ];
  //                                 if (a.constructor === Date) {
  //                                   if (a.getTime() !== b.getTime()) {
  //                                     orderError = true;
  //                                   }
  //                                 } else {
  //                                   if (a !== b) {
  //                                     orderError = true;
  //                                   }
  //                                 }
  //                                 return orderError;
  //                               });
  //                               i++;
  //                             }
  //                           }
  //                           orderError ? answer(false, 'vérifier ordre') : answer(true, sqlAnswer);
  //                         }
  //                       });
  //                     }
  //                   } else {
  //                     answer(false, 'vérifier conditions et schéma');
  //                   }
  //                 });
  //               });
  //             } else {
  //               answer();
  //             }
  //           }
  //         });
  //       });
  //     });
  //   })
}

async function getDBList(req, res) {

  let connection;
  try {
    connection = await new mssql.ConnectionPool(mssqlConfig).connect();

    const result = await connection.request()
      // Query written by dsz on https://stackoverflow.com/a/44428117/4687028
      .query(`
        SELECT top 0 * INTO #temp
        FROM INFORMATION_SCHEMA.TABLES;

        INSERT INTO #temp EXEC sp_msforeachdb 'SELECT * FROM [?].INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE=''BASE TABLE''';

        SELECT LOWER(TABLE_CATALOG) AS OWNER, count(*) AS TABLECOUNT
        FROM #temp
        WHERE TABLE_CATALOG NOT IN ('master', 'msdb', 'tempdb')
        GROUP BY TABLE_CATALOG;

        DROP TABLE #temp;
      `);

    res.write(JSON.stringify(result.recordset));
  } catch (err) {
    console.log('Error', err);
    Raven.captureException(err);
    res.sendStatus(500);
  }

  connection && connection.close();
  res.end();
}

function getQuestionByID(id, callback) {
  pgPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query('SELECT * FROM questions WHERE id = $1',
      [ id ], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
        }
        if (result.rows.length > 0) {
          callback(result.rows[ 0 ]);
        } else {
          callback();
        }
        done();
      });
  });
}

function logAnswer(log) {
  pgPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query('INSERT INTO logs (activity, question_id, query, error, user_id, user_name, ip, created) VALUES($1,$2,$3,$4,$5,$6,$7, NOW())',
      [ log.activity, log.question_id, log.query, log.error, log.user_id, log.user_name, log.ip ], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
        }
        done();
      });
  });
}

function upsertQuestion(req, res) {
  const question = req.body;
  pgAdminPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      res.sendStatus(500);
      return;
    }
    //TODO check valid question first?

    //if id update
    if (question.id) {
      client.query('UPDATE questions SET text=$2, sql=$3, modified = now() WHERE id = $1 RETURNING id',
        [ question.id, question.text, question.sql ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.send(JSON.stringify(result.rows[ 0 ]));
          }
          done();
        });
    } else {
      //else insert
      client.query('INSERT INTO questions (db_schema, text, sql, modified) VALUES ($1, $2, $3, now()) RETURNING id',
        [ question.db_schema, question.text, question.sql ], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.send(JSON.stringify(result.rows[ 0 ]));
          }
          done();
        });
    }
  });
}

function startApplication(callback) {
  app.listen(config.app.port, () => {
    console.log(`[${new Date().toTimeString().split(' ')[ 0 ]}] Example app listening on port ${config.app.port}!`)
    if (callback) callback();
  });
}
