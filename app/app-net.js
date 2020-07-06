/**
 * App level network management.
 */

"use strict";


const appNet = function () {

    const localEndpoint = new p2p.LocalEndpoint();

    let pendingInviteCon = null;
    let pendingJoinCon = null;

    function getLocalId() {
        return localEndpoint.shortId;
    }

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
                    completedConnection(pendingInviteCon);
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
                    completedConnection(pendingJoinCon);
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


    const hub = new p2p.Hub(localEndpoint);
    hub.onAutoConnect = connection => {
        completedConnection(connection);
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
            chan.send(this.localName);
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
        }

        // change state

        setGridSize(size) {
            this.state.setData({ gridSize: size });
            this.broadcast(new p2p.Frame("state", this.state.frame()).serialize());
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
            chan.send(new p2p.Frame("state", this.state.frame()).serialize());

            // meeting point
            this.readiness.addRemote(connection.remoteEndpoint.id);
            if (this.readiness.isWaiting()) {
                chan.send(new p2p.Frame("readiness", this.readiness.frame()).serialize());
            }
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
        }
    }
    const pregame = new PregameHandler(localEndpoint);


    function completedConnection(connection) {
        console.debug("connection registered");
        connection.registerDataChannel("hub", hub);
        connection.registerDataChannel("chat", chat);
        connection.registerDataChannel("names", names);
        connection.registerDataChannel("pregame", pregame);

        let div = document.createElement("div");
        let lastName = null;
        let update = () => {
            lastName = names.getName(connection.remoteEndpoint?.id) ?? lastName;
            if (connection.isConnected) {
                div.innerHTML =
                    `<div class="player remote">${lastName ?? "?"}</div>
                <div>${connection.pingDelay ?? "-"} ms</div>
                <div class="con-status ok"><i class="fas fa-check-circle"></i></div>`;
            } else {
                div.innerHTML =
                    `<div class="player remote">${lastName ?? "?"}</div>
                <div class="con-status ko">connection lost <i class="fas fa-times-circle"></i></div>
                <button class="btn" onclick="page.rmListEl(this);"><i class="fas fa-trash-alt"></i></button>`;
            }
        };

        connection.onStateChange = update;
        connection.onPingChange = update;
        names.setOnChange(connection.remoteEndpoint.id, update);

        update();
        page.elements().party.list.add(div);
    }

    return {
        getLocalId,
        invite: invite,
        join: join,
        channels: {
            hub: hub,
            names: names,
            chat: chat,
            pregame: pregame,
        }
    }
}();