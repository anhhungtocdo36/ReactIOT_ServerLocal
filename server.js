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

//db.get('device').remove(db.get('device').find({"id":"4060259"}).value()).write();
    

var app = express();
const port = process.env.PORT || 3000;

var server = http.createServer(requestHandler);
var ws = new WebSocket.Server({ server });
var clients = [];
var socketLocalPage = [];
var timerJob = [];

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
    res.send({ data1: _res1, data2: _res2, 'user':{'name':'Admin'}});
    console.log()
});

app.get('/db/device/:id', ensureLoggedIn(), function (req, res) {
    console.log(req.params.id);
    var devices = db.get('device').value();
    console.log(devices);
    var _res = [];
    //db.set('device',_res).write();
    for(var i=devices.length-1;i>=0;i--)
        if (devices[i]['room_id']==req.params.id)
            _res.push(devices[i]);
    console.log(_res);
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
                console.log(JSON.stringify(jsonControl));
            }
        client.subscribe('Server/Status',JSON.stringify(body));
    });
    /*setInterval(function () { 
        var dataCurrent = {"ID":4060259,"value":Math.random()*(5)};
        socket.emit('current', dataCurrent);
    }, 1000);*/ 
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
    client.subscribe('ServerLocal/Timer');
})

// example Json: {"ID":1234,"Status":"0"}

client.on('message', function (topic, message) {
    console.log("[" + topic.toString() + "] : " + message.toString());
    var json = JSON.parse(message);
    switch (topic) {
        case "ServerLocal/Control":
            for (var i = 0; i < clients.length; i++)
                if (clients[i]['ID'].toString() == json['ID']) {
                    var jsonControl = { "Status": json['Status'] };
                    clients[i]['socket'].send(JSON.stringify(jsonControl));
                    console.log(JSON.stringify(jsonControl));
                }
            client.publish('Server/Control',message.toString());
            break;
        case "ServerLocal/CheckID":
        	var fCheck = false;
            /*
            for (var i = 0; i < clients.length; i++)
            	if (clients[i]['ID'] == json['ID']) {
                	client.publish('Server/CheckID', JSON.stringify(Object.assign({}, json, {ok: true})));
                	fCheck = true;
                    console.log("Matched ID");
                    db.get('device').push(json).write();
                	break;
            	}
        	if (!fCheck){
            	client.publish('Server/CheckID',JSON.stringify({ok:false}));
            	console.log("Not Matched");
            }*/
            client.publish('Server/CheckID', JSON.stringify(Object.assign({}, json, {ok: true})));
            console.log("Matched ID");
            db.get('device').push(json).write();
            break;
        case "ServerLocal/SyncDatabase":
            if (json['Action']=="DeleteDevice"){
                db.get('device').remove(db.get('device').find({"id":json['Content']['ID']}).value()).write();
                client.publish("Server/DeleteDevice",JSON.stringify({ID: json['Content']['ID']}));
            } else
            if (json['Action']=="DeleteRoom"){
                client.publish("Server/DeleteRoom",JSON.stringify({ID: json['Content']['ID']}));
                db.get('room').remove(db.get('room').find({'id':json['Content']['ID']}).value()).write();
                db.get('device').remove(db.get('device').find({'room_id':json['Content']['ID']}).value()).write();
                db.get('roomDetail').remove(db.get('roomDetail').find({'room_id':json['Content']['ID']}).value()).write();
            } else 
            if (json['Action']=="AddRoom"){
                db.get('room').push(json['Content']).write();
                var newRoomDetail = {
                    "active": "0",
                    "total": "0",
                    "room_id": json['Content']['id'],
                    "room_name": json['Content']['room_name']
                  }
                db.get('roomDetail').push(newRoomDetail).write();
                client.publish("Server/AddRoom",JSON.stringify(json['Content']));
            } else
            if (json['Action']=="SyncRoomDetail"){
                if (json['Content']['total']=="0")
                    db.get('roomDetail')
                      .remove(db.get('roomDetail').find({'room_id':json['Content']['room_id']}).value())
                      .write();
                else 
                    db.set('roomDetail',json['Content']['roomDetail']).write();
            }
            break;
        case "ServerLocal/Timer": //{"id", "status", "time"}
            var arr_time = json['time'].split(":");
            //timerJob = new cron(arr_time[2]+" "+arr_time[1]+" "+arr_time[0])
            var index = -1;
            for (i = 0;i<clients.length;i++){
                if (clients[i]['ID'] == json['id']){
                    index = i;
                    break;
                }
            }
            if (index != -1){
                if ((clients[index]['timer_status']==false) && (json['status']==true)){
                    console.log("Set timer");
                    var time = new Date();
                    clients[index]['timer_status']=true;
                    db.get('device').find({'id':json['id']}).assign({'timer_status':true}).write();
                    time.setHours(parseInt(arr_time[0]),parseInt(arr_time[1]),parseInt(arr_time[2]));
                    console.log(arr_time[2].toString()+" "+arr_time[1].toString()+" "+arr_time[0].toString()+" * * 1-7");
                    clients[index]['timer'] = new cron(arr_time[2].toString()+" "+arr_time[1].toString()+" "+arr_time[0].toString()+" * * 1-7",
                        function(){
                            clients[index]['socket'].send(JSON.stringify({"Status":"0"}));
                            //io.sockets.in("Server/Control" + json['id'].toString())
                            //.emit('switch', {"status": "0"});
                            UpdataStatusToServer(json['id'],0);
                            this.stop();
                        }, function(){
                            db.get('device').find({'id':json['id']}).assign({'timer_status':false}).write();
                            clients[index]['timer_status']==false;
                            console.log("Completed");
                        }, true, "Asia/Ho_Chi_Minh");
                } else if ((clients[index]['timer_status']==true) && (json['status']==false)){
                    console.log("Cancel Duty");
                    clients[index]['timer'].stop();
                }
            }
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
    client.publish('Server/Control', JSON.stringify(dataStatus));
    console.log('Server/Control', JSON.stringify(dataStatus));
    //io.sockets.in("Server/Control"+ID).emit('switch', dataStatus);
    socketLocalPage.forEach(function(data){
        data.emit('switch',dataStatus);
    });
}

function UpdateCurrentToServer(ID, value) {
    var dataCurrent = { "ID": ID, "value": Math.random()+1 };
    client.publish('Server/Current', JSON.stringify(dataCurrent));
    //io.sockets.in("Server/Current"+ID).emit('current', dataCurrent);    
    socketLocalPage.forEach(function(data){
        data.emit('current',dataCurrent);
    });
    console.log("send data");
}

ws.on('connection', function (socket, req) {
    var new_timer;
    var newData = {"ID": 0, "socket": socket, "power": 0, "nUpdate": 0, "timer": new_timer
                    , "timer_status": false};
    console.log("1 client connected");
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
                var fAdd = true;
                for (var i = 0; i < clients.length; i++)
                    if (clients[i]['ID'] == json['message']) {
                        fAdd = false;
                        break;
                    }
                if (fAdd) {
                    clients.push(newData);
                    console.log('Number of Client: ' + clients.length);
                }
                break;
            case 'UpdateStatus':
                console.log('Update Status from device ID: ' + json['message']['ID']);
                UpdataStatusToServer(json['message']['ID'],json['message']['status']);
                client.publish('Server/Control',message.toString());
                //io.sockets.in("Server/Control" + json['message']['ID'].toString())
                //          .emit('switch', {"ID":json['message']['ID'], "status": json['message']['status'].toString()});
                break;
            case 'UpdateData':
                console.log('Update Data from device ID: ' + json['message']['ID'].toString());
                UpdateCurrentToServer(json['message']['ID'], json['message']['current']);
                var index = -1;
                for (var i=0;i<clients.length;i++)
                    if (clients[i]['ID']==json['message']['ID']){
                        index=i;
                        break;
                    }
                if (index!=-1){
                    clients[index]['power'] += json['message']['power'];
                    clients[index]['nUpdate']++;        
                }
                break;
        }
    })

});

var job = new cron('00 59 23 * * 1-7', function(){
    console.log("Update Power to Server");
    clients.forEach(function(data){
        var avgPower = 0;
        if (data['nUpdate']!=0)
            avgPower = data['power']/data['nUpdate'];
        var dataPower = {'ID':data['ID'],'value':avgPower};
        client.publish('Server/UpdatePower',JSON.stringify(dataPower));
        io.sockets.in("Server/Power" + data['ID'].toString())
                  .emit('power', {"value": avgPower});
        var deviceSel = db.get('device').find({'id':data['ID']}).value();
        deviceSel['value'].push(avgPower);
        deviceSel['date'].push(new Date().toDateString());
        db.get('device').find({'id':data['ID']}).assign(deviceSel).write();
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
/*
{ data1: [],
    data2: 
     [ anonymous {
         id: '8b0cffe98f2a9f511d9fddf98e1b5080',
         room_name: 'Phòng khách' } ],
    user: 
     anonymous {
       id: 1,
       name: 'user1',
       account: 'account1                      ',
       password: 'fbade9e36a3f36d3d676c1b808451dd7' } }
]  

*/