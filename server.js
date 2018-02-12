const express = require('express');
const bodyParser = require('body-parser');
const Pool = require('pg').Pool;
// const oracledb = require('oracledb');
const mssql = require('mssql');
const app = express();
const cors = require('cors');
const basicAuth = require('basic-auth-connect');
const xmlBuilder = require('xmlbuilder');
const AdmZip = require('adm-zip');
const exec = require("child_process").exec;
const tmp = require('tmp');
const Raven = require('raven');
const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
const reduce = require('object.reduce');

const ENV = require('./env.test');

const pgConString = "postgres://root:Math3r$0n@localhost/sqlexplorer";
const pgConAdminString = "postgres://root:Math3r$0n@localhost/sqlexplorer";
let oraclePool;

const pgPool = new Pool({ connectionString: pgConString });
const pgAdminPool = new Pool({ connectionString: pgConAdminString });
pgPool.on('error', function(err, client) {
  Raven.captureException(err);
});

const SENTRY_DSN = '';

Raven.config(SENTRY_DSN).install();
app.use(Raven.requestHandler());
app.use(Raven.errorHandler());

passport.use(new BasicStrategy(
  function(username, password, done) {
    if (username === 'admin' && password === 'pwd') {
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
app.use(express.static('public'));
app.use('/schema_pics', express.static('schema_pics'));
app.use(passport.initialize());


const jsonParser = bodyParser.json();
const txtParser = bodyParser.text();
const urlencodedParser = bodyParser.urlencoded({ extended: false });

app.post('/api/evaluate', jsonParser, function(req, res) {
  if (!req.body) return res.sendStatus(400);
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
      [req.params.id], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
          res.sendStatus(500);
        }
        if (result.rows.length > 0) {
          res.write(JSON.stringify(result.rows[0]));
        } else {
          res.sendStatus(404);
        }
        res.end();
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
        [req.params.id], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[0]));
          } else {
            res.sendStatus(404);
          }
          res.end();
          done();
        });
    });
  });

app.post('/api/question', jsonParser,
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    if (!req.body) return res.sendStatus(400);
    console.log(req.body);
    upsertQuestion(req, res, req.body);
  });

app.get('/api/scorm/:id',
  passport.authenticate('basic', { session: false }),
  function(req, res) {
    if (isNaN(req.params.id)) {
      createScorm(req, res, [{ id: req.params.id }]);
    } else {
      pgPool.connect(function(err, client, done) {
        if (err) {
          console.error('error fetching client from pool', err);
          Raven.captureException(err);
          return;
        }
        client.query('SELECT question_id AS id FROM assignment_questions WHERE assignment_id = $1 ORDER BY aq_order ASC',
          [req.params.id], function(err, result) {
            if (err) {
              console.error('error running query', err);
              Raven.captureException(err);
              res.sendStatus(500);
            }
            if (result.rows.length > 0) {
              createScorm(req, res, result.rows);
            } else {
              res.sendStatus(404);
            }
            done();
          });
      });
    }
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
            res.write(JSON.stringify(result.rows[0].json));
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
        [req.params.user_id], function(err, result) {
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

function createScorm(req, res, rows) {
  const scormName = 'SQL|Explorer';
  const xml = xmlBuilder.create('manifest', { version: '1.0', encoding: 'UTF-8' });
  xml.att('identifier', scormName);
  xml.att('version', '1.2');
  xml.att('xmlns', 'http://www.imsproject.org/xsd/imscp_rootv1p1p2');
  xml.att('xmlns:adlcp', 'http://www.adlnet.org/xsd/adlcp_rootv1p2');
  xml.att('xmlns:imsmd', 'http://www.imsglobal.org/xsd/imsmd_rootv1p2p1');
  xml.att('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
  xml.att('xsi:schemaLocation', 'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd');
  const org = xml.ele('organizations', { default: 'sqlexplorer' })
    .ele('organization', { identifier: 'sqlexplorer', structure: 'hierarchical' });
  org.ele('title', {}, scormName);

  rows.forEach(function(row, idx) {
    const i = idx + 1;
    const item = org.ele('item', { identifier: 'ITEM-' + i, identifierref: 'sco_target', isvisible: 'true', parameters: 'id=' + row.id });
    item.ele('title', {}, 'Question ' + i);
    item.ele('adlcp:masteryscore', {}, '1');
  });
  xml.ele('resources')
    .ele('resource', { identifier: 'sco_target', 'adlcp:scormtype': 'sco', href: 'index.html', type: 'webcontent' })
    .ele('file', { href: 'index.html' });

  const zip = new AdmZip();
  zip.addLocalFile('scorm/adlcp_rootv1p2.xsd');
  zip.addLocalFile('scorm/ims_xml.xsd');
  zip.addLocalFile('scorm/imscp_rootv1p1p2.xsd');
  zip.addLocalFile('scorm/imsmd_rootv1p2p1.xsd');
  // zip.addLocalFile('public/index.html');
  zip.addFile('imsmanifest.xml', new Buffer(xml.end({ pretty: true })));
  res.write(zip.toBuffer());
  res.end();
}

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
      [id],
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
      [id],
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
        res.sendStatus(500);
        return;
      }
      client.query('INSERT INTO assignments (name, year, course) VALUES ($1, $2, $3) RETURNING id',
        [req.body.name, req.body.year, req.body.course], function(err, result) {
          if (err) {
            console.error('error running query', err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[0]));
          }
          res.end();
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
        res.sendStatus(500);
        return;
      }
      client.query('INSERT INTO assignment_questions (assignment_id, question_id, aq_order) VALUES ($1, $2, (SELECT COUNT(*) FROM assignment_questions WHERE assignment_id = $1))',
        [req.params.assignmentId, req.body.questionId], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          res.end();
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
        return;
      }
      const keywords = req.body.keywords || [];
      const dbname = req.body.dbname.toUpperCase() || 'ALL';
      const andOr = req.body.inclusive === '1' ? 'OR' : 'AND';

      let sql = `SELECT t.id, t.text, t.sql, t.db_schema, json_agg(keyword) AS keywords
        FROM (
          SELECT q.id, q.text, q.sql, q.db_schema, k.name AS keyword
          FROM questions q
          JOIN keywords k ON lower(q.sql) LIKE  '%' || lower(k.name) || '%'`;

      if (dbname !== 'ALL') {
        sql += 'WHERE q.db_schema = $' + (keywords.length + 1);
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
            res.sendStatus(500);
          }
          if (result.rows) {
            res.write(JSON.stringify(result.rows));
            res.end();
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

const config = {
  user: ENV.username,
  password: ENV.password,
  server: ENV.mssql.server + "\\" + ENV.mssql.instanceName + "false"
};

const mssqlPool = new mssql.ConnectionPool(config);

//export sql sol to pdf
app.get('/api/pdf/:id', function(req, res) {
  getAssignementById(req.params.id, function(assignment_err, assignment) {
    getAssignmentQuestions(req.params.id, function(err, result) {
      tmp.tmpName(function _tempNameGenerated(err, path) {
        if (err) throw err;
        exec('php sql_to_pdf.php ' + path + ' "' + assignment.rows[0].name + '" "' + JSON.stringify(result.rows).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"', { cwd: 'sql_to_pdf' }, function(error, stdout, stderr) {
          res.setHeader('Content-type', 'application/pdf');
          res.setHeader('Content-disposition', 'attachment; filename=' + assignment.rows[0].name + '.pdf');
          res.sendFile(path);
        });
      });
    });
  });
});

function query(req, res) {
  let schema = req.body.db ? req.body.db.replace(/[^a-z_0-9]/gi, '').toUpperCase() : 'SQLEXPLORER';

  mssqlPool.connect(err => {
    if (err) {
      console.log(err instanceof mssql.ConnectionError);
      console.log('Error connecting to db:', err);
      return res.sendStatus(500);
    }
    const transaction = new mssql.Transaction(mssqlPool);
    transaction.begin(err => {
      if (err) {
        console.log('Error connecting to db:', err);
        mssqlPool.close();
        return res.sendStatus(500);
      }
      transaction.request().query(`USE ${schema};`, (err, result) => {
        if (err) {
          console.log('Error executing query:', err);
          transaction.rollback().then(() => { mssqlPool.close(); });
          return res.sendStatus(500);
        }

        if (!req.body.sql) {
          transaction.rollback().then(() => { mssqlPool.close(); });
          return res.sendStatus(404);
        }

        const sqlToTest = req.body.sql.replace(/;/g, '');

        transaction.request().query(sqlToTest, (err, result) => {
          const data = {
            headers: [],
            content: [],
            numrows: 0
          };

          function answer(correct, msg) {
            const log = {
              activity: schema,
              question_id: undefined,
              query: req.body.sql,
              error: undefined,
              user_id: undefined,
              user_name: undefined,
              ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
            };

            if (typeof (correct) !== 'undefined') {
              data.correct = log.correct = correct;
            }
            if (data.correct) {
              data.answer = msg;
            } else {
              if (typeof (msg) !== 'undefined') {
                data.error = log.error = msg;
              }
            }
            if (req.body.id) {
              log.question_id = req.body.id;
            }
            if (req.body.user_id) {
              log.user_id = req.body.user_id;
            }
            if (req.body.user_name) {
              log.user_name = req.body.user_name;
            }

            logAnswer(log);

            transaction.commit().then(() => { mssqlPool.close(); });
            res.send(JSON.stringify(data));
          }

          if (err) {
            transaction.rollback().then(() => { mssqlPool.close(); });
            res.send(JSON.stringify({ error: err.toString() }));
          } else {
            if (result.recordset.length > 0) {
              reduce(result.recordset.columns, (acc, value) => {
                acc.push(value.name);
                return acc;
              }, data.headers);
              data.content = result.recordset.slice(0, 1000).map(function(row) {
                Object.keys(row).forEach(key => {
                  if (row[key] === null) { row[key] = '(NULL)'; }
                });
                return row;
              });
              data.numrows = result.recordset.length;
            }

            if (req.body.id) {
              getQuestionByID(req.body.id, question => {
                const sqlAnswer = question.sql;
                transaction.request().query(sqlAnswer.replace(/;/g, ''), (err, resultAnswer) => {
                  if (err) {
                    console.log('Error executing query sqlAnswer:', err);
                    transaction.rollback().then(() => { mssqlPool.close(); });
                    return res.sendStatus(500);
                  }
                  if (result.recordset.length === resultAnswer.recordset.length) {
                    if (Object.keys(result.recordset.columns).length !== Object.keys(resultAnswer.recordset.columns).length) {
                      answer(false, 'vérifier select');
                    } else {
                      const sqlSets = `
                        (${sqlAnswer.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')} EXCEPT ${sqlToTest.toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')})
                        UNION
                        (${sqlToTest.toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')} EXCEPT ${sqlAnswer.replace(/;/g, '').toUpperCase().replace(/ORDER\s+BY(.|\n)*/g, '')})
                      `;

                      transaction.request().query(sqlSets, (err, resultsSets) => {
                        if (err) {
                          answer(false, 'erreur de vérification: ' + err.message);
                        } else if (resultsSets.recordset.length > 0) {
                          answer(false, 'pas la bonne réponse');
                        } else {
                          let orderError = false;
                          if (sqlAnswer.toUpperCase().match(/ORDER\s+BY/)) {
                            let i = 0;
                            while (!orderError && i < resultAnswer.recordset.length) {
                              Object.keys(resultAnswer.recordset[i]).some(key => {
                                const a = resultAnswer.recordset[i][key];
                                const b = result.recordset[i][key];
                                if (a.constructor === Date) {
                                  if (a.getTime() !== b.getTime()) {
                                    orderError = true;
                                  }
                                } else {
                                  if (a !== b) {
                                    orderError = true;
                                  }
                                }
                                return orderError;
                              });
                              i++;
                            }
                          }
                          orderError ? answer(false, 'vérifier ordre') : answer(true, sqlAnswer);
                        }
                      });
                    }
                  } else {
                    answer(false, 'vérifier conditions et schéma');
                  }
                });
              });
            } else {
              answer();
            }
          }
        });
      });
    });
  });
  /*
  mssqlPool.connect(function(err) {
    new mssql.Request(mssqlPool).query(`USE ${schema};`, (err, result) => {
      if (err) {
        console.log('Error executing query:', err);
        return res.sendStatus(500);
      }

      if (!req.body.sql) {
        return res.sendStatus(404);
      }

      const sqlToTest = req.body.sql.replace(/;/g, '');

      new mssql.Request(mssqlPool).query(sqlToTest, (err, result) => {
        const data = {
          headers: [],
          content: [],
          numrows: 0
        };

        function answer(correct, msg) {
          const log = {
            activity: schema,
            question_id: undefined,
            query: req.body.sql,
            error: undefined,
            user_id: undefined,
            user_name: undefined,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
          };

          if (typeof (correct) !== 'undefined') {
            data.correct = correct;
            log.correct = correct;
          }
          if (data.correct) {
            data.answer = msg;
          } else {
            if (typeof (msg) !== 'undefined') {
              data.error = msg;
              log.error = msg;
            }
          }
          if (req.body.id) {
            log.question_id = req.body.id;
          }
          if (req.body.user_id) {
            log.user_id = req.body.user_id;
          }
          if (req.body.user_name) {
            log.user_name = req.body.user_name;
          }

          logAnswer(log);

          res.write(JSON.stringify(data));
          mssqlPool.close();
          res.end();
        }

        if (err) {
          res.write(JSON.stringify({ error: err.toString() }));
          mssqlPool.close();
          res.end();
        } else {
          if (result.recordset.length > 0) {
            reduce(result.recordset.columns, (acc, value) => {
              acc.push(value.name);
              return acc;
            }, data.headers);
            data.content = result.recordset.slice(0, 1000).map(function(row) {
              reduce(row, (acc, value, key) => {
                if (value === null) row[key] = '(NULL)';
              });
              return row;
            });
            data.numrows = result.recordset.length;
          }

          if (req.body.id) {
            getQuestionByID(req.body.id, question => {
              const sqlAnswer = question.sql;
              new mssql.Request(mssqlPool).query(sqlAnswer.replace(/;/g, ''), (err, resultAnswer) => {
                if (err) {
                  console.log('Error executing query sqlAnswer:', err);
                  mssqlPool.close();
                  res.sendStatus(500);
                  return;
                }

                if (results.recordset.length === resultAnswer.recordset.length) {
                  const sqlSets = `
                    (SELECT * FROM (${sqlAnswer.replace(/;/g, '')}) MINUS SELECT * FROM (${sqlToTest}))
                    UNION
                    (SELECT * FROM (${sqlToTest}) MINUS SELECT * FROM (${sqlAnswer.replace(/;/g, '')}))
                  `;

                  new mssql.Request(mssqlPool).query(sqlSets, (err, resultsSets) => {
                    if (err) {
                      answer(false, 'erreur de vérification: ' + err.message);
                    } else if (resultsSets.recordset.length > 0) {
                      answer(false, 'vérifier select');
                    } else {
                      if (sqlAnswer.toUpperCase().match(/ORDER\s+BY/)) {
                        let a, b;

                      }
                      answer(true, sqlAnswer);
                    }
                  });
                } else {
                  answer(false, 'vérifier conditions et schéma');
                }
              });
            });
          } else {
            answer();
          }
        }
      });
    });
  });
  */
}

async function getDBList(req, res) {

  let connection;
  try {
    connection = await mssqlPool.connect();

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
    res.sendStatus(500);
  }

  connection && connection.close();
  res.end();
}

function exportDBSchema(req, res, dbname) {
  const schema = dbname.replace(/[^a-z_0-9]/gi, '').toUpperCase();
  oraclePool.getConnection(function(err, connection) {
    if (err) { console.log('Error connecting to db:', err); res.sendStatus(500); return; }
    connection.execute('ALTER SESSION SET CURRENT_SCHEMA="' + schema + '"', [], function(err, results) {
      if (err) { console.log('Error executing query:', err); res.sendStatus(500); return; }

      let tableColumnsAndFksSQL = `
        SELECT acol.table_name, acol.column_name, acol.data_type, acol.data_length, acol.data_precision, acol.data_scale, acol.nullable, fk.constraint_name, fk.r_owner, fk.r_constraint_name, fk.r_table_name, fk.r_column_name
        FROM all_tab_cols acol
        LEFT JOIN (
          SELECT col.owner, col.table_name, col.column_name, col.constraint_name,  cons.R_OWNER, cons.R_CONSTRAINT_NAME, rcol.table_name r_table_name, rcol.column_name r_column_name
          FROM all_cons_columns col, all_constraints cons, all_cons_columns rcol
          WHERE col.table_name = cons.table_name
          AND col.constraint_name = cons.constraint_name
          AND cons.constraint_type = 'R'
          AND rcol.owner = cons.r_owner
          AND rcol.constraint_name = cons.r_constraint_name
          AND rcol.position = col.position
        ) fk ON fk.table_name = acol.table_name AND fk.column_name = acol.column_name
        AND fk.owner = acol.owner
        WHERE acol.owner = '`;
      tableColumnsAndFksSQL += schema;
      tableColumnsAndFksSQL += "' ORDER BY acol.table_name, acol.column_id";
      connection.execute(tableColumnsAndFksSQL, [], function(err, tableColumnsAndFks) {
        if (err) { console.log('Error fetchings data:', err); res.sendStatus(500); return; }
        let primaryKeysSQL = `
          SELECT col.table_name, col.column_name, col.constraint_name
          FROM all_cons_columns col, all_constraints cons
          WHERE col.table_name = cons.table_name
          AND col.constraint_name = cons.constraint_name
          AND cons.constraint_type = 'P'
          AND col.owner = '`;
        primaryKeysSQL += schema + "'";

        tableColumnsAndFks = tableColumnsAndFks.rows;
        /*
        table_name 0
        column_name 1
        data_type 2
        data_length 3
        data_precision 4
        data_scale 5
        nullable 6
        constraint_name 7
        r_owner 8
        r_constraint_name 9
        r_table_name 10
        r_column_name 11
        */
        connection.execute(primaryKeysSQL, [], function(err, primaryKeys) {
          if (err) { console.log('Error fetchings data:', err); res.sendStatus(500); return; }
          const xml = xmlBuilder.create('sql');
          //datatypes
          //tables
          let lastTable = '';
          for (let t = 0; t < tableColumnsAndFks.length; t++) {
            const table = tableColumnsAndFks[t][0];
            let tableNode;
            if (lastTable != table) {
              //write table
              tableNode = xml.ele('table', { name: camelCase(table) });
            }
            const rowNode = tableNode.ele('row', {
              name: camelCase(tableColumnsAndFks[t][1]),
              null: tableColumnsAndFks[t][6] === 'Y' ? 1 : 0
            });
            rowNode.ele('datatype', {}, tableColumnsAndFks[t][2]);
            if (tableColumnsAndFks[t][10] && tableColumnsAndFks[t][11]) {
              rowNode.ele('relation', {
                table: camelCase(tableColumnsAndFks[t][10]),
                row: camelCase(tableColumnsAndFks[t][11])
              });
            }

            //Pkeys
            if (lastTable != table || t === tableColumnsAndFks.length) {
              const parts = primaryKeys.rows.filter(function(elem) {
                return elem[0] === table;
              });
              /*
                table_name, column_name, constraint_name
              */
              if (parts.length > 0) {
                const pkeyNode = tableNode.ele('key', { name: parts[0][2], type: 'PRIMARY' });
                parts.forEach(function(elem) {
                  pkeyNode.ele('part', {}, camelCase(elem[1]));
                });
              }
            }
            lastTable = table;
            //index
          }
          res.write(xml.end({ pretty: true }));
          connection.release(function(err) {
            if (err) {
              console.error(err.message);
              Raven.captureException(err);
            }
          });
          res.end();
        });
      });
    });
  });
}

function camelCase(word) {
  const tableNames = [];
  const customKeywords = ["prix", "date", "quantite", "limite", "dossier", "chassis", "publicitaire",
    "article", "principal", "heure", "dossard", "annee", "horaire", "specialiste", "medecin", "generaliste",
    "places", "ordre", "federation", "standard", "reparation", "stock", "volume", "unite", "mesure",
    "piece", "plaque", "appel", "temps", "travaux", "rechange"];
  const keywords = customKeywords.concat(tableNames);
  //arsort($keywords);
  ucKeywords = [];
  keywords.forEach(function(capitalizeMe) {
    ucKeywords.push(capitalizeMe.charAt(0).toUpperCase() + capitalizeMe.substring(1).toLowerCase());
  });

  const missingkey = str_replace(keywords, '', word);
  if (missingkey != 'tbl') {
    keywords.push(missingkey);
    ucKeywords.push(missingkey.charAt(0).toUpperCase() + missingkey.substring(1).toLowerCase());
  }
  return str_replace(keywords, ucKeywords, word);
}

function str_replace(search, replace, subject, count) {
  //  discuss at: http://phpjs.org/functions/str_replace/
  // original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // improved by: Gabriel Paderni
  // improved by: Philip Peterson
  // improved by: Simon Willison (http://simonwillison.net)
  // improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // improved by: Onno Marsman
  // improved by: Brett Zamir (http://brett-zamir.me)
  //  revised by: Jonas Raoni Soares Silva (http://www.jsfromhell.com)
  // bugfixed by: Anton Ongson
  // bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // bugfixed by: Oleg Eremeev
  //    input by: Onno Marsman
  //    input by: Brett Zamir (http://brett-zamir.me)
  //    input by: Oleg Eremeev
  //        note: The count parameter must be passed as a string in order
  //        note: to find a global constiable in which the result will be given
  //   example 1: str_replace(' ', '.', 'Kevin van Zonneveld');
  //   returns 1: 'Kevin.van.Zonneveld'
  //   example 2: str_replace(['{name}', 'l'], ['hello', 'm'], '{name}, lars');
  //   returns 2: 'hemmo, mars'

  let i = 0,
    j = 0,
    temp = '',
    repl = '',
    sl = 0,
    fl = 0,
    f = [].concat(search),
    r = [].concat(replace),
    s = subject,
    ra = Object.prototype.toString.call(r) === '[object Array]',
    sa = Object.prototype.toString.call(s) === '[object Array]';
  s = [].concat(s);
  if (count) {
    this.window[count] = 0;
  }

  for (i = 0, sl = s.length; i < sl; i++) {
    if (s[i] === '') {
      continue;
    }
    for (j = 0, fl = f.length; j < fl; j++) {
      temp = s[i] + '';
      repl = ra ? (r[j] !== undefined ? r[j] : '') : r[0];
      s[i] = (temp)
        .split(f[j])
        .join(repl);
      if (count && s[i] !== temp) {
        this.window[count] += (temp.length - s[i].length) / f[j].length;
      }
    }
  }
  return sa ? s : s[0];
}

function getQuestionByID(id, callback) {
  pgPool.connect(function(err, client, done) {
    if (err) {
      console.error('error fetching client from pool', err);
      Raven.captureException(err);
      return;
    }
    client.query('SELECT * FROM questions WHERE id = $1',
      [id], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
        }
        if (result.rows.length > 0) {
          callback(result.rows[0]);
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
      [log.activity, log.question_id, log.query, log.error, log.user_id, log.user_name, log.ip], function(err, result) {
        if (err) {
          console.error('error running query', err);
          Raven.captureException(err);
        }
        done();
      });
  });
}

function upsertQuestion(req, res, question) {
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
        [question.id, question.text, question.sql], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[0]));
          }
          res.end();
          done();
        });
    } else {
      //else insert
      client.query('INSERT INTO questions (db_schema, text, sql, modified) VALUES ($1, $2, $3, now()) RETURNING id',
        [question.db_schema, question.text, question.sql], function(err, result) {
          if (err) {
            console.error('error running query', err);
            Raven.captureException(err);
            res.sendStatus(500);
            return;
          }
          if (result.rows.length > 0) {
            res.write(JSON.stringify(result.rows[0]));
          }
          res.end();
          done();
        });
    }
  });
}

app.listen(3000, () => console.log('Example app listening on port 3000!'));