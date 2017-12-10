var fs = require('fs');
var url = require('url');
var http = require('http');
var WebSocket = require('ws');
var mqtt = require('mqtt');
var express = require('express');
var socketio = require('socket.io');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var flash = require('connect-flash');
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json')
const db = low(adapter)

db.defaults({ room: [], roomDetail: [], device: [] })
    .write();

var app = express();
const port = process.env.PORT || 5000;

var server = http.createServer(requestHandler);
var ws = new WebSocket.Server({ server });
var clients = [];
var socketLocalPage = [];

passport.use(new LocalStrategy({
    usernameField: 'username',
    passwordField: 'password'
},
    function (username, password, cb) {
        if ((username == 'admin') && (password == 'admin')) {
            var ob = { 'id': 1 };
            return cb(null, ob);
        } else
            return cb(false);
    }));

passport.serializeUser(function (user, cb) {
    cb(null, user.id);
});

passport.deserializeUser(function (id, cb) {
    cb(null, { 'id': 1 });
});


app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(require('express-session')({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false
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
    res.redirect('/');
});

app.get('/db', ensureLoggedIn(), function (req, res) {
    const _res2 = db.get('room').value();
    const _res1 = db.get('roomDetail').value();
    res.send({ data1: _res1, data2: _res2 });
});

app.get('/db/device/:id', ensureLoggedIn(), function (req, res) {
    const _res = db.get('device').value();
    res.send(_res);
});
/* 
    Socket connection
*/
io.on('connection', function (socket) {
    console.log('Someone has connected!');
    socketLocalPage.push(socket);
    socket.on('switch', function (body) {
        //client.publish('ServerLocal/Control', JSON.stringify(body));
        for (var i = 0; i < clients.length; i++)
            if (clients[i][1] == body['ID']) {
                var jsonControl = { "Status": body['Status'].toString() };
                clients[i][0].send(JSON.stringify(jsonControl));
            }
        client.subscribe('Server/Status',JSON.stringify(body));
    });
    /*setInterval(function () { 
        var dataCurrent = {"ID":4060259,"value":Math.random()*(5)};
        socket.emit('current', dataCurrent);
    }, 1000);*/ 
});

// MQTT

var client = mqtt.connect({
    host: 'm14.cloudmqtt.com',
    port: 11486,
    username: 'ohkpjxcf',
    password: '_3KWZeUTV7qe'
})

// json of topic SyncDatabase: 
// {'action':'DeleteRoom','content':id_room}

client.on('connect', function () {
    console.log('Server Local Connected to MQTT broker!');
    client.subscribe('ServerLocal/Control');
    client.subscribe('ServerLocal/CheckID');
    client.subscribe('ServerLocal/SyncDatabase');
})

// example Json: {"ID":1234,"Status":"0"}

client.on('message', function (topic, message) {
    console.log("[" + topic.toString() + "] : " + message.toString());
    var json = JSON.parse(message);
    switch (topic) {
        case "ServerLocal/Control":
            for (var i = 0; i < clients.length; i++)
                if (clients[i][1] == json['ID']) {
                    var jsonControl = { "Status": json['Status'].toString() };
                    clients[i][0].send(JSON.stringify(jsonControl));
                }
            break;
        case "ServerLocal/CheckID":
            for (var i = 0; i < clients.length; i++)
                var fCheck = false;
            if (clients[i][1] == json['ID']) {
                client.publish('Server/CheckID', json['ID']);
                fCheck = true;
                break;
            }
            if (!fCheck)
                client.publish('Server/CheckID', 'ID not matched');
            break;
    }
})

function requestHandler(request, response) {
    fs.readFile('./index.html', function (error, content) {
        response.writeHead(200, {
            'Content-Type': 'text/html'
        });
        response.end(content);
    });
}
/*
function broadcast(socket, data) {
    console.log(clients.length);
    for(var i=0; i<clients.length; i++) {
        if(clients[i] != socket) {
            clients[i].send(data);
        }
    }
}
*/

function UpdataStatusToServer(ID, status) {
    var dataStatus = { "ID": ID, "Status": status };
    client.publish('Server/Status', JSON.stringify(dataStatus));
}

function UpdateCurrentToServer(ID, value) {
    var dataCurrent = { "ID": ID, "value": value };
    client.publish('Server/Current', JSON.stringify(dataCurrent));
    socketLocalPage.forEach(function(data){
        data.emit('current', dataCurrent);
    })
    
}

function UpdataPowerToServer(ID, value) {
    var dataPower = { "ID": ID, "time": new Date().toString(), "value": value };
    client.publish('Server/Power', JSON.stringify(datapower));
}

ws.on('connection', function (socket, req) {
    var newData = [];
    newData.push(socket);
    console.log("1 client connected")
    socket.on('updateData', function (data) {
        console.log('received: %s', data);
    });

    socket.on('close', function () {
        //var index = clients.indexOf(socket);
        //clients.splice(index, 1);
        console.log('disconnected');
    });

    socket.on('message', function (message) {
        console.log(message);
        var json = JSON.parse(message);
        switch (json['Action']) {
            case 'ClientID':
                newData.push(json['message']);
                var fAdd = false;
                for (var i = 0; i < clients.length; i++)
                    if (clients[i][1] != json['message']) {
                        fAdd = true;
                        break;
                    }
                if (fAdd || (clients.length == 0)) {
                    clients.push(newData);
                    console.log('Add a new Client with ID: ' + json['message']);

                }
                break;
            case 'UpdateStatus':
                console.log('Update Status from device ID: ' + json['message']['ID']);
                UpdataStatusToServer(json['message']['ID'],json['message']);
                break;
            case 'UpdateCurrent':
                console.log('Update Current from device ID: ' + json['message']['ID']);
                UpdateCurrentToServer(json['message']['ID'], json['message']['value']);
                break;
            case 'UpdatePower':
                console.log('Update Power from device ID: ' + json['message']['ID']);
                UpdatePowerToServer(json['message']['ID'], json['message']['value']);
                break;
        }
    })

});
/*
setInterval(function () { 
    var dataCurrent = {"ID":4060259,"value":Math.random()*(5)};
    client.publish('Server/Current',JSON.stringify(dataCurrent));
}, 1000); 
*/
server.listen(8000);
console.log('Server listening on port 8000');
