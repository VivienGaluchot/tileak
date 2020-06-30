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
        constructor() {
            super();
            // remote id -> name
            this.nameMap = new Map();
            // remote id -> change handler
            this.handlerMap = new Map();
        }

        setLocalName(name) {
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

        onopen(connection, chan) {
            super.onopen(connection, chan);
            chan.send(page.elements().party.localName.get());
        }

        onmessage(connection, chan, evt) {
            this.nameMap.set(connection.remoteEndpoint.id, evt.data);
            this.handlerMap.get(connection.remoteEndpoint.id)?.();
        }

        onclose(connection, chan) {
            super.onclose(connection, chan);
            this.nameMap.delete(connection.remoteEndpoint.id);
            this.handlerMap.delete(connection.remoteEndpoint.id);
        }
    }
    const names = new NameHandler();


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
        constructor() {
            super();
            // synchronize between peers
            // * selected grid size
            // * player order
            // * ready player set
            // * game launch

            // TODO ensure consistencies between remote states to avoid issue with message crossing
            // use a distributed logic clock

            this.clock = 0;
        }

        setGridSize(size) {
            let frame = new p2p.Frame("grid-size", size);
            this.broadcast(frame.serialize());
        }

        onmessage(connection, chan, evt) {
            let frame = p2p.Frame.deserialize(evt.data);
            let handler = new p2p.FrameHandler()
                .on("grid-size", data => {
                    page.elements().preGame.gridSizeSelector.set(data);
                }).else(() => {

                });
            handler.handle(frame);
        }
    }
    const pregame = new PregameHandler();


    function completedConnection(connection) {
        console.debug("connection registered");
        connection.registerDataChannel("hub", { negotiated: true, id: 100 }, hub);
        connection.registerDataChannel("chat", { negotiated: true, id: 101 }, chat);
        connection.registerDataChannel("names", { negotiated: true, id: 102 }, names);
        connection.registerDataChannel("pregame", { negotiated: true, id: 103 }, pregame);

        let div = document.createElement("div");
        let lastName = null;
        let update = () => {
            lastName = names.getName(connection.remoteEndpoint?.id) ?? lastName;
            if (connection.isConnected) {
                div.innerHTML =
                    `<div class="player-id remote">${connection.remoteEndpoint?.shortId ?? "?"}</div>
                    <div class="player remote">${lastName ?? "?"}</div>
                    <div>${connection.pingDelay ?? "-"} ms</div>
                    <div class="con-status ok"><i class="fas fa-check-circle"></i></div>`;
            } else {
                div.innerHTML =
                    `<div class="player-id remote">${connection.remoteEndpoint?.shortId ?? "?"}</div>
                    <div class="player remote">${lastName ?? "?"}</div>
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