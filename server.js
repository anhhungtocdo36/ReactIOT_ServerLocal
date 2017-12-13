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
var cron = require('cron').CronJob;

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const adapter = new FileSync('db.json')
const db = low(adapter)

db.defaults({ room: [], roomDetail: [], device: [] })
    .write();

var app = express();
const port = process.env.PORT || 3000;

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
        console.log("switch");
        for (var i = 0; i < clients.length; i++)
            if (clients[i]['ID'] == body['ID']) {
                var jsonControl = { "Status": body['Status'].toString() };
                clients[i]['socket'].send(JSON.stringify(jsonControl));
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
                if (clients[i]['ID'] == json['ID']) {
                    var jsonControl = { "Status": json['Status'].toString() };
                    clients[i]['socket'].send(JSON.stringify(jsonControl), function(err,res){
                        if (err) throw err;
                    });

            	}
            client.publish('Server/Control',message);
            break;
        case "ServerLocal/CheckID":
        	var fCheck = false;
        	for (var i = 0; i < clients.length; i++)
            	if (clients[i]['ID'] == json['ID']) {
                	client.publish('Server/CheckID', message);
                	fCheck = true;
                	console.log("Matched ID");
                	break;
            	}
        	if (!fCheck){
            	client.publish('Server/CheckID', 'ID not matched');
            	console.log("Not Matched");
        	}
            break;
        case "ServerLocal/SyncDatabase":
            if (json['Action']=="DeleteDevice"){
                client.publish("Server/DeleteDevice",JSON.stringify({ID: json['Content']['ID']}));
            } else
            if (json['Action']=="DeleteRoom"){
                client.publish("Server/DeleteRoom",JSON.stringify({ID: json['Content']['ID']}));
            }
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
    // for (var i=0;i<socketLocalPage.length;i++)
    //     socketLocalPage[i].emit('status',dataStatus);
}

function UpdateCurrentToServer(ID, value) {
    var dataCurrent = { "ID": ID, "value": Math.random()+4 };
    client.publish('Server/Current', JSON.stringify(dataCurrent));
    console.log("send data");
    
}

ws.on('connection', function (socket, req) {
    var newData = {"ID": 0, "socket": socket, "power": 0, "nUpdate": 0};
    console.log("1 client connected")
    socket.on('updateData', function (data) {
        console.log('received: %s', data);
    });

    socket.on('close', function () {
        var index = -1;
        for (var i=0;i<clients.length;i++)
        	if (clients[i]['socket']==socket){
        		index = i;
        		break;
        	}
        if (index==-1) 
        	return;
        else 
        	clients.splice(index, 1);
        console.log('disconnected');
    });
    

    socket.on('message', function (message) {
        console.log(message);
        var json = JSON.parse(message);
        switch (json['Action']) {
            case 'ClientID':
                newData['ID'] = json['message'];
                var fAdd = false;
                for (var i = 0; i < clients.length; i++)
                    if (clients[i]['ID'] != json['message']) {
                        fAdd = true;
                        break;
                    }
                if (fAdd || (clients.length == 0)) {
                    clients.push(newData);
                    console.log('Number of Client: ' + clients.length);

                }
                break;
            case 'UpdateStatus':
                console.log('Update Status from device ID: ' + json['message']['ID']);
                UpdataStatusToServer(json['message']['ID'],json['message']['status']);
                break;
            case 'UpdateData':
                console.log('Update Data from device ID: ' + json['message']['ID'].toString());
                UpdateCurrentToServer(json['message']['ID'], json['message']['current']);
                clients['power'] += json['message']['power'];
                clients['nUpdate']++;
                break;
        }
    })

});

var job = new cron('00 59 23 * * 1-7', function(){
    console.log("Update Power to Server");
    clients.forEach(function(data){
        var dataPower = {'ID':data['ID'],'value':data['power']/data['nUpdate']};
        client.publish('Server/UpdatePower',JSON.stringify(dataPower));
    })
},function(){
    console.log("Update Power complete!!!");
    clients.forEach(function(data){
        data['power'] = 0;
        data['nUpdate'] = 0;
    })
}, true, 'Asia/Ho_Chi_Minh')




/*
setInterval(function () { 
    var dataCurrent = {"ID":4060259,"value":Math.random()*(5)};
    client.publish('Server/Current',JSON.stringify(dataCurrent));
}, 1000); 
*/
server.listen(8000);
console.log('Server listening on port 8000');
