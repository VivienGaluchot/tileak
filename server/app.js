#!/usr/bin/env node

'use strict';


const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const url = require("url");
const path = require('path');


// logging

function formatLog(level, msg) {
    return `${new Date().toISOString()} - ${level} | ${msg}`;
}

function logDebug(msg) {
    console.debug(formatLog(`DEBUG`, msg));
}

function logInfo(msg) {
    console.log(formatLog(`INFO `, msg));
}

function logError(msg) {
    console.error(formatLog(`ERROR`, msg));
}

// http

let port = process.env.PORT;
if (!port) {
    port = "8080";
    logInfo(`defaulting to port ${port}`);
}

let mimeMap = new Map();
mimeMap.set(".js", "application/javascript");
mimeMap.set(".json", "application/json");
mimeMap.set(".css", "text/css");
mimeMap.set(".jpeg", "image/jpeg");
mimeMap.set(".jpg", "image/jpeg");
mimeMap.set(".png", "image/png");
mimeMap.set(".svg", "image/svg+xml");

function sendFile(pathname, response) {
    fs.readFile(pathname, (err, data) => {
        if (err) {
            response.writeHead(404);
            response.end();
            logError("can't read file, " + err);
            return;
        }
        let ext = path.extname(pathname);
        let mime = mimeMap.get(ext);
        if (mime)
            response.setHeader("Content-Type", mimeMap.get(ext));

        response.setHeader("Cache-Control", "public,max-age=3600")
        response.writeHead(200);
        response.end(data);
    });
}

const server = http.createServer(function (request, response) {
    var pathname = url.parse(request.url).pathname;
    // serve static files
    if (pathname == "/" || pathname == "/index.html") {
        sendFile("static/index.html", response);
    } else if (pathname.startsWith("/static")) {
        sendFile("./" + pathname, response);
    } else {
        logInfo(`request not found ${request.url}`);
        response.writeHead(404);
        response.end();
    }
});
server.listen(port, function () {
    logInfo(`server listening on port ${port}`);
});


// peers

class PeerSet {
    constructor() {
        // store peers connection by id
        // id -> connection
        this.peerMap = new Map();
    }

    getConnection(id) {
        return this.peerMap.get(id);
    }

    register(id, connection) {
        if (this.peerMap.has(id)) {
            logError(`peer id collision`);
        } else {
            this.peerMap.set(id, connection);
            logDebug(`peer registered '${id}', count '${this.peerMap.size}'`);
            connection.id = id;
        }
    }

    unregister(id) {
        this.peerMap.delete(id);
        logDebug(`peer unregistered '${id}', count '${this.peerMap.size}'`);
    }
}

let set = new PeerSet();


// web socket

const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    path: "/ws",
});

function originIsAllowed(origin) {
    logInfo("connection origin " + origin);
    if (origin == "http://127.0.0.1:8080")
        return true;
    if (origin == "https://tileak.herokuapp.com")
        return true;
    return false;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        logError(`connection from origin '${request.origin}' rejected.`);
        return;
    }

    try {
        let connection = request.accept('tileak-signaling', request.origin);
        connection.id = null;
        connection.on('message', message => {
            if (message.type === 'binary') {
                logError(`received binary message of ${message.binaryData.length} bytes`);
                return
            }
            if (message.type !== 'utf8') {
                logError(`received non utf8 message of type ${message.type}`);
            }

            let data = JSON.parse(message.utf8Data);
            if (data.id != undefined) {
                if (connection.id != null) {
                    logError(`connection with id '${connection.id}' already registered`);
                    return;
                }
                set.register(data.id, connection);

            } else if (data.to != undefined && data.data != undefined) {
                let src = connection;
                let dst = set.getConnection(data.to);
                let payload = data.data;
                if (!dst) {
                    logError(`cant forward to '${data.to}', dst not known`);
                    return;
                }
                if (src.id == null) {
                    logError(`prevent forward to '${data.to}', src not identified`);
                    return;
                }
                logDebug(`forward from '${src.id}'to '${dst.id}' '${JSON.stringify(payload)}'`);

                dst.sendUTF(JSON.stringify({ from: src.id, data: payload }));
            } else {
                logError(`unexpected data received ${JSON.stringify(data)}`);
            }
        });
        connection.on('close', (reasonCode, description) => {
            if (connection.id) {
                set.unregister(connection.id);
            }
        });
    } catch (error) {
        logError(error);
    }
});