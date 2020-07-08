/**
 * App level network management.
 */

"use strict";


const appNet = function () {

    const localEndpoint = new p2p.LocalEndpoint();

    let pendingInviteCon = null;
    let pendingJoinCon = null;

    function getLocalId() {
        return localEndpoint.id;
    }

    // serverless peering

    function invite() {
        console.debug("invite");
        if (pendingInviteCon == null) {
            // clear UI
            page.elements().party.localOffer.clear();
            page.elements().party.remoteAnswer.clear();
            page.elements().party.inviteStatus.set("none", false, false);

            // create connection
            console.debug("new invite PeerConnection");
            pendingInviteCon = new p2p.PeerConnection(localEndpoint);

            // status change callback
            pendingInviteCon.onStateChange = () => {
                page.elements().party.inviteStatus.set(pendingInviteCon.getStateDetails(), pendingInviteCon.isConnected, null);
                if (pendingInviteCon.isConnected) {
                    pendingInviteCon.onStateChange = null;
                    connectionCompleted(pendingInviteCon);
                    page.elements().party.tabPartyInvite.disable();
                    pendingInviteCon = null;
                }
            }

            // create offer
            pendingInviteCon.createOffer()
                .then((offer) => {
                    console.debug("createOffer ok");
                    page.elements().party.localOffer.set(offer);
                })
                .catch(reason => {
                    console.error("createOffer error", reason);
                    page.elements().party.inviteStatus.set("error", null, true);
                    pendingInviteCon = null;
                });

            // consume answer on click
            page.elements().party.remoteAnswerBtn.onclick = () => {
                pendingInviteCon?.consumeAnswer(page.elements().party.remoteAnswer.get())
                    .then(() => {
                        console.debug("consumeAnswer ok");
                    })
                    .catch(reason => {
                        console.error("consumeAnswer error", reason);
                        page.elements().party.inviteStatus.set("error", null, true);
                        pendingInviteCon = null;
                    });
            };
        }
    }

    function join() {
        console.debug("join");
        if (pendingJoinCon == null) {
            // clear UI
            page.elements().party.localAnswer.clear();
            page.elements().party.remoteOffer.clear();
            page.elements().party.joinStatus.set("none", false, false);

            // create connection
            console.debug("new join PeerConnection");
            pendingJoinCon = new p2p.PeerConnection(localEndpoint);

            // status change callback
            pendingJoinCon.onStateChange = () => {
                page.elements().party.joinStatus.set(pendingJoinCon.getStateDetails(), pendingJoinCon.isConnected, null);
                if (pendingJoinCon.isConnected) {
                    pendingJoinCon.onStateChange = null;
                    connectionCompleted(pendingJoinCon);
                    page.elements().party.tabPartyJoin.disable();
                    pendingJoinCon = null;
                }
            }

            // consume offer and make answer on click
            page.elements().party.remoteOfferBtn.onclick = () => {
                pendingJoinCon?.consumeOfferAndGetAnswer(page.elements().party.remoteOffer.get())
                    .then(answer => {
                        console.debug("consumeOfferAndGetAnswer ok");
                        page.elements().party.localAnswer.set(answer);
                    })
                    .catch(reason => {
                        console.error("consumeOfferAndGetAnswer error", reason);
                        page.elements().party.joinStatus.set("error", null, true);
                        pendingJoinCon = null;
                    });
            }
        }
    }

    // signaling server peering

    let signalingForward = null;
    let signalingPendingConnections = new Map();

    function answerSignaledConnection(targetId, offer) {
        if (signalingPendingConnections.has(targetId)) {
            console.error("unexpected state", targetId);
            return;
        }

        let connection = new p2p.PeerConnection(localEndpoint);
        signalingPendingConnections.set(targetId, connection);

        connection.onStateChange = () => {
            if (connection.isConnected) {
                console.debug(`signaling | auto connected to peer ${connection.remoteEndpoint.id}`);
                signalingPendingConnections.delete(targetId);
                connection.onStateChange = null;
                connectionCompleted(connection);
            }
            // TODO handle failed state
        }
        connection.consumeOfferAndGetAnswer(offer)
            .then(answer => {
                console.debug("signaling | consumeOfferAndGetAnswer ok");
                // send back the answer to targetId via a common peer
                let answerData = {
                    answer: answer
                };
                if (signalingForward == null) {
                    console.error("signaling | server not connected, impossible to join via signaling");
                    signalingPendingConnections.delete(targetId);
                } else {
                    signalingForward(targetId, new p2p.Frame("connection-answered", answerData));
                }
            })
            .catch(reason => {
                console.error("signaling | consumeOfferAndGetAnswer error", reason);
                signalingPendingConnections.delete(targetId);
            });
    }

    function completeSignaledConnection(targetId, answer) {
        let connection = signalingPendingConnections.get(targetId);
        if (connection == undefined)
            throw new Error("unexpected state");

        connection.consumeAnswer(answer)
            .then(() => {
                console.debug("signaling | consumeAnswer ok");
            })
            .catch(reason => {
                console.error("signaling | consumeAnswer error", reason);
                signalingPendingConnections.delete(targetId);
            });
    }

    function connectToSignaling(localId) {
        let wsProtocol;
        if (window.location.protocol != "http:") {
            wsProtocol = "wss:";
        } else {
            wsProtocol = "ws:";
        }
        let ws = new WebSocket(`${wsProtocol}//${location.host}/ws`, "tileak-signaling");

        ws.onopen = () => {
            console.debug("signaling | onopen");

            ws.send(JSON.stringify({ id: localId }));

            signalingForward = (to, data) => {
                ws.send(JSON.stringify({ to: to, data: data }));
            };
        };

        ws.onmessage = e => {
            let data = JSON.parse(e.data);
            let from = data.from;
            let frame = data.data;
            console.debug(`signaling | message from ${from}`, frame);

            let signalingFrameHandler = new p2p.FrameHandler()
                .on("connection-offered", data => {
                    console.debug("signaling | connection-offered");
                    answerSignaledConnection(from, data.offer);
                })
                .on("connection-answered", data => {
                    console.debug("signaling | connection-answered");
                    completeSignaledConnection(from, data.answer);
                });

            signalingFrameHandler.handle(frame)
        };

        ws.onclose = e => {
            console.debug("signaling | onclose.", e.reason);
            signalingForward = null;

            setTimeout(() => {
                connectToSignaling(localId);
            }, 1000);
        };

        ws.onerror = err => {
            console.error("signaling | onerror", err.message, "Closing socket");
            ws.close();
        };
    }

    function joinViaSignaling(targetId) {
        return new Promise((resolve, reject) => {
            if (targetId.length == 0) {
                console.error("target id undefined");
                reject();
            } else if (signalingPendingConnections.has(targetId)) {
                console.error("unexpected state", targetId);
                reject();
            } else {
                let connection = new p2p.PeerConnection(localEndpoint);
                signalingPendingConnections.set(targetId, connection);

                connection.onStateChange = () => {
                    if (connection.isConnected) {
                        console.debug(`signaling | connected to peer ${connection.remoteEndpoint.id}`);
                        signalingPendingConnections.delete(targetId);
                        connection.onStateChange = null;
                        connectionCompleted(connection);
                        resolve();
                    }
                    // TODO reject when failed
                }
                connection.createOffer()
                    .then((offer) => {
                        console.debug("signaling | createOffer ok");
                        let offerData = {
                            offer: offer
                        };
                        if (signalingForward == null) {
                            console.error("signaling | server not connected, impossible to join via signaling");
                            reject();
                        } else {
                            signalingForward(targetId, new p2p.Frame("connection-offered", offerData));
                        }
                    })
                    .catch(reason => {
                        console.error("signaling | createOffer error", reason);
                        signalingPendingConnections.delete(targetId);
                        reject();
                    });
            }
        });
    }

    function setupSignaling() {
        connectToSignaling(localEndpoint.id);
    }


    // channels

    const hub = new p2p.Hub(localEndpoint);
    hub.onAutoConnect = connection => {
        connectionCompleted(connection);
    };


    class NameHandler extends p2p.BroadcastHandler {
        constructor(localEndpoint) {
            super();
            this.localEndpoint = localEndpoint;
            this.localName = null;

            // remote id -> name
            this.nameMap = new Map();
            // remote id -> change handler
            this.handlerMap = new Map();
        }

        setLocalName(name) {
            this.localName = name;
            this.nameMap.set(this.localEndpoint.id, name);
            this.broadcast(name);
        }

        setOnChange(id, handler) {
            this.handlerMap.set(id, handler);
        }

        getName(id) {
            if (id == null)
                return null;
            return this.nameMap.get(id);
        }

        onopen(connection, chan, evt) {
            super.onopen(connection, chan, evt);
            console.debug("NameHandler | onopen", chan);
            if (this.localName.length > 0)
                chan.send(this.localName);
            else
                chan.send("noname");
        }

        onmessage(connection, chan, evt) {
            console.debug("NameHandler | onmessage", connection.remoteEndpoint.id, evt.data, chan);
            this.nameMap.set(connection.remoteEndpoint.id, evt.data);
            this.handlerMap.get(connection.remoteEndpoint.id)?.();
        }

        onclose(connection, chan, evt) {
            super.onclose(connection, chan, evt);
            this.nameMap.delete(connection.remoteEndpoint.id);
            this.handlerMap.delete(connection.remoteEndpoint.id);
        }
    }
    const names = new NameHandler(localEndpoint);


    class ChatHandler extends p2p.BroadcastHandler {
        constructor() {
            super();
        }

        onmessage(connection, chan, evt) {
            page.elements().chat.addHistory(names.getName(connection.remoteEndpoint?.id), evt.data);
        }
    }
    const chat = new ChatHandler();

    class PregameHandler extends p2p.BroadcastHandler {
        constructor(localEndpoint) {
            super();
            this.localEndpoint = localEndpoint;

            // synchronized state between peers
            // * selected grid size
            // * player order
            // * ready player set
            // * game launch

            this.state = new ccp.SharedState(localEndpoint.id);
            this.state.onUpdate = data => {
                page.elements().preGame.gridSizeSelector.set(data.gridSize);
            };

            this.readiness = new ccp.MeetingPoint(localEndpoint.id);

            // players
            // id -> onTurn(turn)
            this.playersOnTurn = null;

            this.onPlayersChange = () => { console.warn("unregistered handler") };
        }

        // change state

        setGridSize(size) {
            let frame = this.state.setDataAndGetFrame({ gridSize: size });
            this.broadcast(new p2p.Frame("state", frame).serialize());
        }

        waitForStart() {
            // TODO lock the shared state to it's current cycle
            let promise = this.readiness.wait();
            this.broadcast(new p2p.Frame("readiness", this.readiness.frame()).serialize());
            return promise;
        }

        // get state

        getState() {
            return this.state.getSharedData()
                .catch(() => { throw new Error("unexpected state") });
        }

        players() {
            this.playersOnTurn = new Map();

            // TODO share the players list to avoid inconsistencies on join / leave
            let players = [{
                id: this.localEndpoint.id,
                isLocal: true,
                onTurn: null
            }];
            for (let [id, chan] of this.chanMap) {
                let player = {
                    id: id,
                    isLocal: false,
                    onTurn: turn => { console.warn("handler not set") }
                };
                this.playersOnTurn.set(id, turn => player.onTurn(turn));
                players.push(player);
            }

            players.sort((l, r) => {
                if (l.id > r.id) return 1;
                else if (l.id < r.id) return -1;
                return 0;
            });

            return players;
        }

        // game management

        sendTurn(turn) {
            this.broadcast(new p2p.Frame("turn", turn).serialize());
        }

        // channel

        onopen(connection, chan, evt) {
            super.onopen(connection, chan, evt)
            // shared state
            chan.send(new p2p.Frame("state", this.state.getStateFrame()).serialize());
            // meeting point
            this.readiness.addRemote(connection.remoteEndpoint.id);
            if (this.readiness.isWaiting()) {
                chan.send(new p2p.Frame("readiness", this.readiness.frame()).serialize());
            }
            this.onPlayersChange();
        }

        onmessage(connection, chan, evt) {
            let frame = p2p.Frame.deserialize(evt.data);
            let handler = new p2p.FrameHandler()
                .on("state", data => {
                    this.state.onFrame(connection.remoteEndpoint.id, data);
                }).on("readiness", data => {
                    this.readiness.onFrame(connection.remoteEndpoint.id, data);
                }).on("turn", data => {
                    let remoteId = connection.remoteEndpoint.id;
                    let turn = data;
                    if (this.playersOnTurn.has(remoteId)) {
                        this.playersOnTurn.get(remoteId)(turn);
                    } else {
                        throw new Error("unexpected state");
                    }
                });
            handler.handle(frame);
        }

        onclose(connection, chan, evt) {
            super.onclose(connection, chan, evt);
            this.readiness.deleteRemote(connection.remoteEndpoint.id);
            this.onPlayersChange();
        }
    }
    const pregame = new PregameHandler(localEndpoint);

    // TODO update player list when players are added / removed
    pregame.onPlayersChange = () => {
        for (let player of pregame.players()) {
            let id = player.id;
            let isLocal = player.isLocal;
            // let playerListEl = page.elements().preGame.playerList.makeEl();
            // playerListEl.update(lastKnownName, "", false);
        }
    };


    function connectionCompleted(connection) {
        if (hub.isPeered(connection.remoteEndpoint.id)) {
            console.warn("peer already connected", connection.remoteEndpoint.id);
            return;
        }
        console.debug("connection registered");
        connection.registerDataChannel("hub", hub);
        connection.registerDataChannel("chat", chat);
        connection.registerDataChannel("names", names);
        connection.registerDataChannel("pregame", pregame);

        let playerListEl = page.elements().preGame.playerList.makeEl();
        let peerListEl = page.elements().party.list.makeEl();

        let lastKnownName = null;
        let update = () => {
            lastKnownName = names.getName(connection.remoteEndpoint?.id) ?? lastKnownName;
            if (!connection.isConnected) {
                playerListEl.delete();
            } else {
                playerListEl.update(lastKnownName, "", false);
            }
            peerListEl.update(lastKnownName, connection.isConnected, connection.pingDelay);
        };

        connection.onStateChange = update;
        connection.onPingChange = update;
        names.setOnChange(connection.remoteEndpoint.id, update);

        update();
    }

    return {
        getLocalId,
        invite: invite,
        join: join,
        setupSignaling: setupSignaling,
        joinViaSignaling: joinViaSignaling,
        channels: {
            hub: hub,
            names: names,
            chat: chat,
            pregame: pregame,
        }
    }
}();