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
            // wait between 1 and 5 secs for retry
            let timeout = (Math.random() * 4 + 1) * 1000;
            setTimeout(() => {
                connectToSignaling(localId);
            }, timeout);
        };

        ws.onerror = err => {
            console.error("signaling | onerror", err.message, "Closing socket");
            ws.close();
        };
    }

    function joinViaSignaling(targetId) {
        return new Promise((resolve, reject) => {
            if (targetId.length == 0) {
                reject(`target id undefined`);
                return;
            }
            if (signalingPendingConnections.has(targetId)) {
                reject(`pending connection to ${targetId}`);
                return;
            }
            if (targetId == localEndpoint.id) {
                reject(`can't join local id ${targetId}`);
                return;
            }
            if (hub.isPeered(targetId)) {
                reject(`peer already connected ${targetId}`);
                return;
            }

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
            // remote id -> Set() of change handler
            this.handlerMap = new Map();
        }

        setLocalName(name) {
            this.localName = name;
            this.nameMap.set(this.localEndpoint.id, name);
            this.broadcast(name);
            this.signalChange(this.localEndpoint.id, name);
        }

        setOnChange(id, handler) {
            if (!this.handlerMap.has(id))
                this.handlerMap.set(id, new Set());
            this.handlerMap.get(id).add(handler);
        }

        unsetOnChange(id, handler) {
            if (this.handlerMap.has(id))
                this.handlerMap.get(id).delete(handler);
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
            this.signalChange(connection.remoteEndpoint.id, evt.data);
        }

        onclose(connection, chan, evt) {
            super.onclose(connection, chan, evt);
            this.nameMap.delete(connection.remoteEndpoint.id);
            this.handlerMap.delete(connection.remoteEndpoint.id);
        }

        // internal

        signalChange(id, name) {
            if (this.handlerMap.has(id)) {
                for (let handler of this.handlerMap.get(id)) {
                    handler(name);
                }
            }
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

            // callbacks

            /**
             * called when grid size is updated
             */
            this.onGridSizeUpdate = size => { console.warn("unregistered handler") };

            /**
             * called when a remote peer is waiting for sync
             */
            this.onRemoteSyncWaiting = remoteId => { console.warn("unregistered handler") };

            /**
             * called when player list is updated
             */
            this.onPlayersChange = playerIds => { console.warn("unregistered handler") };

            /**
             * called when a player waiting state changes
             */
            this.onPlayerWaitingChange = (playerId, isWaiting) => { console.warn("unregistered handler") };

            /**
             * called when a player turn is received
             */
            this.onPlayerTurn = (remoteId, turn) => { console.warn("unregistered handler") };


            // synchronized state between peers
            // * selected grid size
            // * player list
            // * synchronize game launch

            this.state = new ccp.SharedState(localEndpoint.id);
            this.state.onUpdate = data => {
                this.onGridSizeUpdate(data.gridSize);
            };

            this.playerWaitingState = new Map();
            this.state.onRemoteSyncWaitingChanged = (remoteId, isWaiting) => {
                this.playerWaitingState.set(remoteId, isWaiting);
                this.onPlayerWaitingChange(remoteId, isWaiting);
            };
        }

        // change state

        setGridSize(size) {
            this.state.setData({ gridSize: size }, frame => {
                this.broadcast(new p2p.Frame("state", frame).serialize());
            });
        }

        // game management

        sendTurn(turn) {
            this.broadcast(new p2p.Frame("turn", turn).serialize());
        }

        // sync management

        isPlayerWaiting(id) {
            if (this.playerWaitingState.has(id))
                return this.playerWaitingState.get(id);
            return false;
        }

        waitForStart() {
            this.onPlayerWaitingChange(this.localEndpoint.id, true);
            this.playerWaitingState.set(this.localEndpoint.id, true);

            let promise = this.state.waitSyncPoint(frame => {
                this.broadcast(new p2p.Frame("state", frame).serialize());
            }).then(result => {
                this.onPlayerWaitingChange(this.localEndpoint.id, false);
                this.playerWaitingState.set(this.localEndpoint.id, false);
                return result;
            });
            return promise;
        }

        // channel

        onopen(connection, chan, evt) {
            super.onopen(connection, chan, evt)
            // shared state
            chan.send(new p2p.Frame("state", this.state.getStateFrame()).serialize());
            // meeting point
            this.state.addSyncPointRemote(connection.remoteEndpoint.id);
            if (this.state.isWaitingSyncPoint()) {
                chan.send(new p2p.Frame("state", this.state.getSyncFrame()).serialize());
            }
            this.onPlayersChange(this.state.syncRemotes());
        }

        onmessage(connection, chan, evt) {
            let frame = p2p.Frame.deserialize(evt.data);
            let handler = new p2p.FrameHandler()
                .on("state", data => {
                    this.state.onFrame(connection.remoteEndpoint.id, data);
                }).on("turn", data => {
                    let remoteId = connection.remoteEndpoint.id;
                    let turn = data;
                    this.onPlayerTurn(remoteId, turn);
                });
            handler.handle(frame);
        }

        onclose(connection, chan, evt) {
            super.onclose(connection, chan, evt);
            this.state.deleteSyncPointRemote(connection.remoteEndpoint.id);
            this.onPlayersChange(this.state.syncRemotes());
        }
    }
    const pregame = new PregameHandler(localEndpoint);


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

        // let playerListEl = page.elements().pregame.playerList.makeEl();
        let peerListEl = page.elements().party.list.makeEl();

        let lastKnownName = null;
        let update = () => {
            lastKnownName = names.getName(connection.remoteEndpoint?.id) ?? lastKnownName;
            // if (!connection.isConnected) {
            //     playerListEl.delete();
            // } else {
            //     playerListEl.update(lastKnownName, "", false);
            // }
            peerListEl.update(lastKnownName, connection.isConnected, connection.pingDelay);
        };

        connection.onStateChange = update;
        connection.onPingChange = update;
        names.setOnChange(connection.remoteEndpoint.id, update);

        update();
    }

    return {
        getLocalId,
        // serverless join
        invite: invite,
        join: join,
        // signaling join
        setupSignaling: setupSignaling,
        joinViaSignaling: joinViaSignaling,
        // channels
        hub: hub,
        names: names,
        chat: chat,
        pregame: pregame
    }
}();