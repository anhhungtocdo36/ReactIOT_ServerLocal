var express = require('express');
var session = require('express-session');
var socketio = require('socket.io');
var https = require('https');
var { Pool, Client } = require('pg');
var httpProxy = require('http-proxy');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var mqtt = require('mqtt');
var flash = require('connect-flash');
var crypto = require('crypto');
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

var client = mqtt.connect({
  host: 'm14.cloudmqtt.com',
  port: 11486,
  username: 'ohkpjxcf',
  password: '_3KWZeUTV7qe'
})

var app = express();

var pool = new Pool({
  user: "swkcgdxapapojz",
  password: "e2f595b6946c021e1f2ce02cd3852cdce6a5e391aa358e5ebc204dc3aa158e54",
  database: "d34l4ng8fd8g0a",
  port: 5432,
  host: "ec2-23-23-249-169.compute-1.amazonaws.com",
  ssl: true
});

const proxy = httpProxy.createProxyServer();
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

// create Proxy to 8080 on development
/*
if (!isProduction) {
  console.log('Build on development!');
  app.all('/build/*', function (req, res) {
    proxy.web(req, res, {
      target: 'http://localhost:8080'
    });
  });
}
else {
  console.log('Build on production!');
}
*/
passport.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password'
},
  function (username, password, cb) {
    const query = "select * from users where account = $1 and password = md5($2)";
    const values = [username, password];
    pool.query(query, values, (err, _res) => {
      if (err) {
        console.log(err.stack);
        return cb(err);
      } else {
        if (!_res.rows) return cb(null, false);
        return cb(null, _res.rows[0]);
      }
    });
  }));

passport.serializeUser(function (user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function (id, cb) {
  const query = "select * from users where id=$1";
  const values = [id];
  pool.query(query, values, (err, _res) => {
    if (err) {
      console.log(err.stack);
      return cb(err);
    } else {
      cb(null, _res.rows[0]);
    }
  });
});


app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
  store: new (require('connect-pg-simple')(session))({
    pool
  }),
  secret: 'bla bla bla',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
  next();
});

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

const io = socketio(
  app.listen(port, function () {
    console.log('Node app is running on port', port);
  })
);

app.get('/', ensureLoggedIn(), function (request, response) {
  response.render('pages/index', {
    title: 'React Internet of things'
  })
});

app.get('/room/:name/:id', ensureLoggedIn(), function (request, response) {
  response.render('pages/index', {
    title: 'React Internet of things'
  })
});

app.get('/login', function (request, response) {
  response.render('pages/index', {
    title: 'Đăng nhập'
  })
});

app.post('/login',
  passport.authenticate('local'),
  function (req, res) {
    res.send('1');
  });

app.get('/logout', function (req, res) {
  req.logout();
  res.sendStatus(200);
});

app.get('/db', ensureLoggedIn(), function (req, res) {
  const query1 = "select count(case when status=true then 1 end) as active, count(status) as total, room_id, room_name from device inner join (select rooms.id, rooms.name as room_name from rooms inner join users on users.id=user_id and users.id=$1) as news on news.id=room_id group by room_id, room_name";
  const query2 = "select rooms.id, rooms.name as room_name from rooms inner join users on users.id=user_id and users.id=$1";
  const values = [req.user.id];

  pool.query(query1, values, (err, _res1) => {

    if (err) {
      console.log(err.stack);
      res.sendStatus(400);
      return;
    } else {

      pool.query(query2, values, (err, _res2) => {

        if (err) {
          console.log(err.stack);
          res.sendStatus(400);
          return;
        } else {
          res.send({ data1: _res1.rows, data2: _res2.rows, user: req.user });
        }

      });
    }

  });

});

app.get('/db/device/:id', ensureLoggedIn(), function (req, res) {
  const query = "select id, (array_agg(value))[1:10] as value, (array_agg(date))[1:10] as date, name, status, timer_status, time from(select device.id as id, value, date, name, status, timer_status, time from power inner join (select * from device where room_id = $1) as device on power.id = device.id order by date desc) as final group by id, name, status, timer_status, time";
  const body = req.params;
  const values = [body.id];
  
  pool.query(query, values, (err, _res) => {
    if (err) {
      console.log(err.stack);
      res.sendStatus(400);
    } else {
      res.send(_res.rows);
    }
  });
});


app.post('/signup', function (req, res) {
  const query = "insert into users(name, account, password) values($1, $2, md5($3))";
  const body = req.body;
  const values = [body.name, body.account, body.password];

  pool.query(query, values, (err, _res) => {
    if (err) {
      console.log(err.stack);
      console.log("Registration failed!")
      res.sendStatus(400);
    } else {
      console.log("Registration succeed!")      
      res.sendStatus(200);
    }
  });

});

app.post('/changePass', ensureLoggedIn(), function (req, res) {
  const query1 = "select * from users where id = $1 and password = md5($2)";
  const query2 = "update users set password = md5($2) where id = $1";
  const body = req.body;
  const values1 = [req.user.id, body.oldPassword];
  const values2 = [req.user.id, body.newPassword];

  pool.query(query1, values1, (err, _res) => {
    if (err) {
      console.log(err.stack);
      res.sendStatus(400);
    } else {
      if (!_res.rows.length) {
        console.log('Sai password!');
        res.sendStatus(401);
      }
      else {
        pool.query(query2, values2, (err, _res) => {
          if (err) {
            console.log(err.stack);
            res.sendStatus(400);
          } else {
            console.log('Da doi password!');
            res.sendStatus(200);
          }
        });
      }
    }
  });

});

app.post('/addroom', ensureLoggedIn(), function (req, res) {
  const body = req.body;
  data = {
    userId: req.user.id,
    id: crypto.createHash('md5').update(body.name).digest('hex'),
    room_name: body.name
  }
  console.log('Hash: ' + data.id);

  client.publish('ServerLocal/SyncDatabase', JSON.stringify({
    Action: 'AddRoom',
    Content: data
  }), { qos: 2 }, (err) => {
    if (err) {
      console.log('Send add room message through MQTT failed');
    }
    else {
      console.log('Send add room message OK!');
    }
  });
  res.sendStatus(200);

});

app.post('/device', ensureLoggedIn(), function (req, res) {
  data = Object.assign({}, req.body, {
    userId: req.user.id,
    timer_status: false,
    time: '00:00:00',
    value: [0],
    date: [new Date(new Date() - 86400).toDateString()]
  });

  client.publish('ServerLocal/CheckID', JSON.stringify(data), { qos: 2 }, function (err) {
    if (err) {
      console.log('Send add device message through MQTT failed');
    }
    else {
      console.log('Send add device message OK!');
    }
  });
  res.sendStatus(200);
})

app.get('/delete/device/:id/:room_id', ensureLoggedIn(), function (req, res) {

  const query1 = 'DELETE FROM power WHERE id = $1';
  const query2 = 'DELETE FROM device WHERE id = $1';
  const query3 = "select count(case when status=true then 1 end) as active, count(status) as total, room_id, room_name from device inner join (select rooms.id, rooms.name as room_name from rooms inner join users on users.id=user_id and users.id=$1) as news on news.id=room_id group by room_id, room_name";
  const values1 = [req.params.id];
  const values2 = [req.user.id];

  pool.query(query1, values1, (err) => {
    if (err) {
      console.log(err.stack);
      console.log('Delete device#1 failed')
    } else {
      pool.query(query2, values1, (err) => {
        if (err) {
          console.log(err.stack);
          console.log('Delete device#2 failed')
        } else {
          console.log('Delete device OK!')

          pool.query(query3, values2, (err, _res) => {

            if (err) {
              console.log(err.stack);
              console.log('Get Room Detail not OK!');
            } else {

              client.publish('ServerLocal/SyncDatabase', JSON.stringify({
                Action: 'DeleteDevice',
                Content: {
                  ID: req.params.id
                }
              }), { qos: 2 }, (err) => {
                if (err) {
                  console.log('Send delete device message through MQTT failed');
                }
                else {
                  console.log('Send delete device message OK!');
                }
              });

              client.publish('ServerLocal/SyncDatabase', JSON.stringify({
                Action: 'SyncRoomDetail',
                Content: {
                  room_id: req.params.room_id,
                  total: _res.rows.length,
                  roomDetail: _res.rows
                }
              }), { qos: 2 }, (err) => {
                if (err) {
                  console.log('Send room detail message through MQTT failed');
                }
                else {
                  console.log('Send room detail device message OK!');
                }
              });

            }

          });

        }
      });
    }
  });

  res.sendStatus(200);
  
})

app.get('/delete/room/:id', ensureLoggedIn(), function (req, res) {

  const query1 = 'delete from power p using device d where p.id = d.id and d.room_id = $1';
  const query2 = 'DELETE FROM device WHERE room_id = $1';
  const query3 = 'DELETE FROM rooms WHERE id = $1';
  const values = [req.params.id];

  pool.query(query1, values, (err) => {
    if (err) {
      console.log(err.stack);
      console.log('Delete room#1 failed')
    } else {
      pool.query(query2, values, (err) => {
        if (err) {
          console.log(err.stack);
          console.log('Delete room#2 failed')
        } else {
          pool.query(query3, values, (err) => {
            if (err) {
              console.log(err.stack);
              console.log('Delete room#3 failed')
            } else {
              console.log('Delete room OK!')

              client.publish('ServerLocal/SyncDatabase', JSON.stringify({
                Action: 'DeleteRoom',
                Content: {
                  ID: req.params.id
                }
              }), { qos: 2 }, (err) => {
                if (err) {
                  console.log('Send delete room message through MQTT failed');
                }
                else {
                  console.log('Send delete room message OK!');
                }
              });

            }
          });
        }
      });
    }
  });

  res.sendStatus(200);

})


/* 
    Socket connection
*/
io.on('connection', function (socket) {
  console.log('Someone has connected!');
  socket.on('switch', function (body) {
    client.publish('ServerLocal/Control', JSON.stringify(body), { qos: 2 });
    console.log(body);
  });
  socket.on('timer', function (body) {
    client.publish('ServerLocal/Timer', JSON.stringify(body), { qos: 2 });
    console.log(body);
  });
  socket.on('subscribe', (data) => {
    data.forEach(e => {
      socket.join('Server/Status' + e);
      socket.join('Server/Current' + e);
      socket.join('Server/Power' + e);
      socket.join('Server/Control' + e);
      console.log('Join ' + e);
    });
  });
});

/*
    MQTT connection
*/
client.on('connect', function () {
  console.log('MQTT connection established!');
  client.subscribe('Server/Status');
  client.subscribe('Server/Current');
  client.subscribe('Server/Power');
  client.subscribe('Server/CheckID');
  client.subscribe('Server/Control');
  client.subscribe('Server/DeleteDevice');
  client.subscribe('Server/DeleteRoom');
  client.subscribe('Server/AddRoom');
})

client.on('message', (topic, message) => {

  let json = JSON.parse(message);

  if (topic == 'Server/Current') {
    console.log('Emit: ' + topic + json.ID + ', value: ' + JSON.stringify(json))
    io.sockets.in(topic + json.ID).emit('current', json);
  }

  else if(topic == 'Server/Power') { 
    console.log('Update power: ' + JSON.stringify(json));
    let query = 'INSERT INTO power(id, value, date) VALUES($1, $2, $3)';
    let values = [json.ID, json.value, json.time];
    // callback
    pool.query(query, values, (err, _res) => {
      if (err) {
        console.log('Update power failed');
      }
      else {
        console.log('Update power OK!');
      }
    });
  }

  else if(topic == 'Server/CheckID') {
    if (json.ok) {
      
      let query1 = 'insert into device(id, name, status, room_id, timer_status, time) values($1, $2, $3, $4, $5, $6)';
      let query2 = 'insert into power(id, value, date) values($1, $2, $3)';
      let query3 = "select count(case when status=true then 1 end) as active, count(status) as total, room_id, room_name from device inner join (select rooms.id, rooms.name as room_name from rooms inner join users on users.id=user_id and users.id=$1) as news on news.id=room_id group by room_id, room_name";
      let values1 = [json.id, json.name, json.status, json.room_id, json.timer_status, json.time];
      let values2 = [json.id, json.value[0], json.date[0]];
      let values3 = [json.userId];

      // callback
      pool.query(query1, values1, (err) => {
        if (err) {
          console.log(err.stack);
          console.log('Failed to add device!');
        }
        else {
          pool.query(query2, values2, (err) => {
            if (err) {
              console.log(err.stack);
              console.log('Failed to add device!');
            }
            else {
              console.log('Successfully added device!');

              pool.query(query3, values3, (err, _res) => {

                if (err) {
                  console.log(err.stack);
                  console.log('Get Room Detail not OK!');
                } else {

                  client.publish('ServerLocal/SyncDatabase', JSON.stringify({
                    Action: 'SyncRoomDetail',
                    Content: {
                      roomDetail: _res.rows
                    }
                  }), { qos: 2 }, (err) => {
                    if (err) {
                      console.log('Send room detail message through MQTT failed');
                    }
                    else {
                      console.log('Send room detail device message OK!');
                    }
                  });

                }

              });

            }
          });
        } 
      });
    }
    else {
      console.log('ID not matched');
    }
  }

  else if (topic == 'Server/Control') {
    let query = 'UPDATE device SET status = $2 WHERE id = $1';
    let values = [json.ID, json.Status];
    console.log('Emit: ' + json.ID + ' / ' + json.Status);
    io.sockets.in(topic + json.ID).emit('switch', json);

    pool.query(query, values, (err, _res) => {
      if (err) {
        console.log(err.stack);
        console.log('Failed to update status!');
      } else {
        console.log('Successfully updated status!');
      }
    });
  }

  else if(topic == 'Server/AddRoom') {
    let query = "insert into rooms(user_id, id, name) values($1, $2, $3)";
    let values = [json.userId, json.id, json.room_name];

    pool.query(query, values, (err, _res) => {
      if (err) {
        console.log('Add room failed');
      } else {
        console.log('Add room OK!');
      }
    });
  }

})
