#!/usr/bin/env node

'use strict';


const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
var url = require("url");

// logging

function formatLog(level, msg) {
    return new Date().toISOString() + ` - ${level} | ${msg}`;
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

const server = http.createServer(function (request, response) {
    var pathname = url.parse(request.url).pathname;
    // serve static files
    if (pathname == "/" || pathname == "/index.html") {
        fs.readFile("static/index.html", (err, data) => {
            if (err) {
                response.writeHead(404);
                response.end();
                logError("can't read file, " + err);
                return;
            }
            response.writeHead(200);
            response.end(data);
        });
    } else if (pathname.startsWith("/static")) {
        fs.readFile("./" + pathname, (err, data) => {
            if (err) {
                response.writeHead(404);
                response.end();
                logError("can't read file, " + err);
                return;
            }
            if (pathname.endsWith(".js")) {
                response.setHeader("Content-Type", "application/javascript");
            }
            response.writeHead(200);
            response.end(data);
        });
    } else {
        logInfo(`request not found ${request.url}`);
        response.writeHead(404);
        response.end();
    }
});
server.listen(port, function () {
    logInfo(`server listening on port ${port}`);
});

// web socket

const wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false,
    path: "/ws",
});

function originIsAllowed(origin) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}

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
            logDebug(`peer registered : '${id}'`);
            this.peerMap.set(id, connection);
            connection.id = id;
        }
    }

    unregister(id) {
        logDebug(`peer unregistered : '${id}'`);
        this.peerMap.delete(id);
    }
}

let set = new PeerSet();

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        logInfo(`Connection from origin '${request.origin}' rejected.`);
        return;
    }

    try {
        let connection = request.accept('tileak-signaling', request.origin);
        logInfo('Connection accepted.');

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
            logInfo(`Peer ${connection.remoteAddress} disconnected.`);
            if (connection.id) {
                set.unregister(connection.id);
            }
        });
    } catch (error) {
        logError(error);
    }
});