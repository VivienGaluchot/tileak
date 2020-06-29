/**
 * Peer to peer networking
 */

"use strict";


const p2p = function () {

    // Frame handling

    function makeTypedFrame(type, data) {
        return {
            type: type,
            data: data
        }
    }

    function onTypedFrame(frameData, type, handler) {
        if (frameData.type == undefined || frameData.data == undefined)
            throw new Error(`unexpected typed frame data '${JSON.stringify(frameData)}'`);
        if (frameData.type == type) {
            handler(frameData.data);
            return true;
        } else {
            return false;
        }
    }

    function serializeFrame(frame) {
        return JSON.stringify(frame);
    }

    function deserializeFrame(frame) {
        return JSON.parse(frame);
    }

    // Network node

    class Endpoint {
        constructor(id) {
            this.id = id;
        }

        get shortId() {
            return this.id?.substr(0, 8);
        }

        serialize() {
            return {
                id: this.id
            };
        }
    }

    class LocalEndpoint extends Endpoint {
        constructor() {
            super(mt.bufferToHex(mt.getRandomByteArray(128 / 8)));
            console.debug(`local endpoint ${this.id}`);
        }
    }

    class RemoteEndpoint extends Endpoint {
        constructor(id) {
            super(id);
            console.debug(`remote endpoint ${this.id}`);
        }

        static deserialize(data) {
            if (data.id == undefined) {
                throw new Error(`unexpected input '${JSON.stringify(data)}'`);
            } else {
                return new RemoteEndpoint(data.id);
            }
        }
    }

    // Network link

    class PeerConnection {
        constructor(localEndpoint) {
            // endpoints

            this.localEndpoint = localEndpoint;
            this.remoteEndpoint = null;

            // callbacks

            this.onStateChange = null;
            this.onPingChange = () => {
                console.debug(`ping received in ${this.pingDelay} ms`);
            };

            // webtrc connection

            this.isInitiator = null;

            const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
            this.pc = new RTCPeerConnection(config);

            this.pc.oniceconnectionstatechange = (evt) => {
                console.debug("ice state change : ", this.pc.iceConnectionState);
                this.onStateChange?.(this);
            };
            this.pc.onsignalingstatechange = (evt) => {
                console.debug("signaling state change : ", this.pc.signalingState);
                this.onStateChange?.(this);
            };
            this.pc.addEventListener("negotiationneeded", event => {
                console.debug("negotiation needed");
            });

            // tag compression

            this.tagCompress = tag => LZString.compressToBase64(tag);
            this.tagDecompress = tag => LZString.decompressFromBase64(tag);

            // mgt channels

            this.pingChanHandler = new PingHandler();

            const makeHandshake = new Promise(resolve => {
                const handler = new HandshakeHandler();
                handler.onHandshake = remoteEndpoint => {
                    this.setRemoteEndpoint(remoteEndpoint);
                    resolve();
                };
                this.registerDataChannel("p2p-handshake", { negotiated: true, id: 1 }, handler);
            });

            makeHandshake.then(() => {
                this.pingChanHandler.onPingChange = () => {
                    this.onPingChange?.();
                };
                this.pingChanHandler.onStateChange = () => {
                    this.onStateChange?.(this);
                };
                this.registerDataChannel("p2p-ping", { negotiated: true, id: 0 }, this.pingChanHandler);
            });
        }

        // init

        setRemoteEndpoint(remoteEndpoint) {
            if (this.remoteEndpoint != null) {
                throw new Error(`remote endpoint already set`);
            }
            if (this.localEndpoint.id == remoteEndpoint.id) {
                throw new Error(`remote and local endpoint must not be the same to prevent networking loops`);
            }
            this.remoteEndpoint = remoteEndpoint;
            this.onStateChange?.(this);
            console.debug(`remote endpoint set`);
        }

        // monitoring

        get pingDelay() {
            return this.pingChanHandler.pingDelay;
        }

        get isConnected() {
            return this.pingChanHandler.isConnected;
        }

        getStateDetails() {
            return `${this.pc.iceConnectionState} ${this.pc.signalingState}`;
        }

        // channels

        registerDataChannel(label, dataChannelDict, handler) {
            const chan = this.pc.createDataChannel(label, dataChannelDict);
            chan.onopen = () => handler.onopen(this, chan);
            chan.onmessage = (evt) => handler.onmessage(this, chan, evt);
            chan.onclose = () => handler.onclose(this, chan);
        }

        // terminate

        close() {
            // untested
            this.pc.close();
        }

        // initiator

        /**
         * Initiate a connection.
         * - The returned string called "offer" shall be sent to the other peer via any channel.
         */
        async createOffer() {
            if (this.isInitiator != null)
                console.error("already initiated");
            this.isInitiator = true;

            await this.pc.setLocalDescription();
            return new Promise(resolve => {
                this.pc.onicecandidate = event => {
                    console.debug("ice candidate ", event.candidate);
                    if (event.candidate != null)
                        return;
                    let rawOffer = this.pc.localDescription.sdp;
                    console.debug("local offer ", rawOffer);
                    resolve(this.tagCompress(rawOffer));
                }
            });
        }

        /**
         * Complete the connection by consuming the peer answer.
         * - Once the peer has the offer, it must send back an "answer" to complete the connection.
         */
        async consumeAnswer(peerAnswer) {
            if (this.isInitiator != true)
                console.error("not initiator");

            if (this.pc.signalingState != "have-local-offer")
                console.error("unexpected signaling state");

            let rawAnswer = this.tagDecompress(peerAnswer);
            console.debug("remote answer ", rawAnswer);
            await this.pc.setRemoteDescription({
                type: "answer",
                sdp: rawAnswer
            });
        }

        // non initiator

        /**
         * Non initiator part. Consume an offer sent from the connection initiator and return an answer.
         * The answer shall be sent back to the initiator via any channel.
         */
        async consumeOfferAndGetAnswer(peerOffer) {
            if (this.isInitiator != null)
                console.error("already initiated");
            this.isInitiator = false;

            if (this.pc.signalingState != "stable")
                console.error("unexpected signaling state");

            let rawOffer = this.tagDecompress(peerOffer);
            console.debug("remote offer ", rawOffer);
            await this.pc.setRemoteDescription({
                type: "offer",
                sdp: rawOffer
            });

            await this.pc.setLocalDescription();
            return new Promise(resolve => {
                this.pc.onicecandidate = event => {
                    console.debug("ice candidate ", event.candidate);
                    if (event.candidate != null)
                        return;
                    let rawAnswer = this.pc.localDescription.sdp;
                    console.debug("local answer ", rawAnswer);
                    resolve(this.tagCompress(rawAnswer));
                }
            });
        }
    }

    // Channels utility

    class ChannelHandler {
        constructor() { }

        onopen(connection, chan) {
            console.debug(`channel opened`);
        }

        onmessage(connection, chan, evt) { }

        onclose(connection, chan) {
            console.debug(`channel closed`);
        }
    }
    class BroadcastHandler extends ChannelHandler {
        constructor() {
            super();
            // remote id -> channel
            this.chanMap = new Map();
        }

        broadcast(data) {
            for (let [id, chan] of this.chanMap) {
                chan.send(data);
            }
        }

        onopen(connection, chan) {
            this.chanMap.set(connection.remoteEndpoint.id, chan);
        }

        onclose(connection, chan) {
            this.chanMap.delete(connection.remoteEndpoint.id);
        }
    }

    class HandshakeHandler extends ChannelHandler {
        constructor() {
            super();

            // callbacks
            this.onHandshake = remoteEndpoint => { };
        }

        onopen(connection, chan) {
            let frameData = {
                endpoint: connection.localEndpoint.serialize(),
            };
            chan.send(serializeFrame(frameData));
        }

        onmessage(connection, chan, evt) {
            let frameData = deserializeFrame(evt.data);
            if (frameData.endpoint == undefined) {
                throw new Error(`unexpected data received '${JSON.stringify(frameData)}'`);
            }
            this.onHandshake?.(RemoteEndpoint.deserialize(frameData.endpoint));
        }
    }

    class PingHandler extends ChannelHandler {
        constructor() {
            super();

            // state
            this.isConnected = false;
            this.pingDelay = null;

            // callbacks
            this.onStateChange = () => {
                if (this.isConnected) {
                    console.debug(`ping channel connected`);
                } else {
                    console.debug(`ping channel disconnected`);
                }
            };
            this.onPingChange = () => {
                console.debug(`ping received in ${this.pingDelay} ms`);
            };

            // internals
            this.pingTimer = null;
            this.pingValue = null
            this.pingSendTime = null;
        }

        onopen(connection, chan) {
            this.isConnected = true;
            this.onStateChange?.(this);

            const sendPing = () => {
                if (this.pingValue != null) {
                    console.debug("ping timeout");
                    this.pingTime = null;
                    this.onPingChange?.(this);
                }

                this.pingValue = mt.getRandomInt(0, 2 ** 32);
                this.pingSendTime = Date.now();

                let frameData = makeTypedFrame("ping",
                    {
                        src: connection.localEndpoint.id,
                        ctr: this.pingValue
                    });
                chan.send(serializeFrame(frameData));

                this.pingTimer = window.setTimeout(function () { sendPing() }, 5000);
            }
            sendPing();
        }

        onmessage(connection, chan, evt) {
            let frameData = deserializeFrame(evt.data);
            let handled = onTypedFrame(frameData, "ping", data => {
                if (data.src == undefined) {
                    throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
                }
                if (data.src == connection.localEndpoint.id) {
                    // ping sent from local peer
                    if (data.ctr == this.pingValue) {
                        this.pingValue = null;
                        this.pingDelay = Date.now() - this.pingSendTime;
                        this.onPingChange?.(this);
                    }
                } else {
                    // ping from remote peer
                    chan.send(evt.data);
                }
            });

            if (!handled)
                throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
        }

        onclose(connection, chan) {
            this.isConnected = false;
            this.onStateChange?.(this);
            clearTimeout(this.pingTimer);
        }
    }

    // Many to many

    class Hub extends ChannelHandler {
        constructor(localEndpoint) {
            super();

            this.localEndpoint = localEndpoint;
            // remote id -> (connection, channel)
            this.peerMap = new Map();

            // remote id -> connection
            this.pendingConnections = new Map();

            // callbacks

            this.onChange = hub => {
                console.debug("hub update");
                for (let con of this.connections()) {
                    console.debug(con.remoteEndpoint.id);
                }
            };

            this.onAutoConnect = connection => { console.debug(`auto connected to peer ${connection.remoteEndpoint.id}`); };
        }

        addConnection(connection, chan) {
            if (connection.localEndpoint.id != this.localEndpoint.id) {
                throw new Error("unexpected local endpoint");
            }
            if (this.peerMap.has(connection.remoteEndpoint.id)) {
                throw new Error(`endpoint already registered ${connection.remoteEndpoint.id}`);
            }
            let peer = { connection: connection, chan: chan };
            this.peerMap.set(connection.remoteEndpoint.id, peer);
            this.onChange?.(this);
        }

        * connections() {
            for (let [id, peer] of this.peerMap) {
                yield peer.connection;
            }
        }

        * peersId() {
            for (let con of this.connections()) {
                yield con.remoteEndpoint.id;
            }
        }

        // routing

        sendRouted(chan, dst, payload) {
            let routedData = {
                src: this.localEndpoint.id,
                dst: dst,
                payload: payload
            };
            let frameData = makeTypedFrame("routed", routedData)
            chan.send(serializeFrame(frameData));
            console.debug("send routed data", frameData);
        }

        // auto connection handling

        // TODO fix concurrency errors
        // * when two already connected groups merge togethers
        //   - Error: endpoint already registered 6bf6c1adfde3d66abbbf847f3f8cdd31 p2p.js:416:23
        //   - Error: unexpected state p2p.js:493:23

        offerRoutedConnection(chan, targetId) {
            let connection = new PeerConnection(this.localEndpoint);
            connection.onStateChange = () => {
                if (connection.isConnected) {
                    console.debug(`auto connected to peer ${connection.remoteEndpoint.id}`);
                    this.pendingConnections.delete(targetId);
                    connection.onStateChange = null;
                    this.onAutoConnect(connection);
                }
            }

            // register the connection
            if (this.pendingConnections.has(targetId))
                throw new Error("unexpected state");
            this.pendingConnections.set(targetId, connection);

            connection.createOffer()
                .then((offer) => {
                    console.debug("createOffer ok");
                    // send the offer to targetId via a common peer
                    let offerData = {
                        srcId: this.localEndpoint.id,
                        offer: offer
                    };
                    this.sendRouted(chan, targetId, makeTypedFrame("connection-offered", offerData));
                })
                .catch(reason => {
                    console.error("createOffer error", reason);
                    this.pendingConnections.delete(targetId);
                });
        }

        answerRoutedConnection(chan, targetId, offer) {
            let connection = new PeerConnection(this.localEndpoint);
            connection.onStateChange = () => {
                if (connection.isConnected) {
                    console.debug(`auto connected to peer ${connection.remoteEndpoint.id}`);
                    this.pendingConnections.delete(targetId);
                    connection.onStateChange = null;
                    this.onAutoConnect(connection);
                }
            }

            // register the connection
            if (this.pendingConnections.has(targetId))
                throw new Error("unexpected state");
            this.pendingConnections.set(targetId, connection);

            connection.consumeOfferAndGetAnswer(offer)
                .then(answer => {
                    console.debug("consumeOfferAndGetAnswer ok");
                    // send back the answer to targetId via a common peer
                    let answerData = {
                        srcId: this.localEndpoint.id,
                        answer: answer
                    };
                    this.sendRouted(chan, targetId, makeTypedFrame("connection-answered", answerData));
                })
                .catch(reason => {
                    console.error("consumeOfferAndGetAnswer error", reason);
                    this.pendingConnections.delete(targetId);
                });
        }

        completeRoutedConnection(targetId, answer) {
            let connection = this.pendingConnections.get(targetId);
            if (connection == undefined)
                throw new Error("unexpected state");

            connection.consumeAnswer(answer)
                .then(() => {
                    console.debug("consumeAnswer ok");
                })
                .catch(reason => {
                    console.error("consumeAnswer error", reason);
                    this.pendingConnections.delete(targetId);
                });
        }


        // channel handling

        onopen(connection, chan) {
            this.addConnection(connection, chan);
            // send already known peers to the new peer
            // the new peer will be in charge to initiate the connection through a common peer if needed
            let knownPeers = Array.from(this.peersId()).filter(id => id != connection.remoteEndpoint.id);
            if (knownPeers.length > 0) {
                let frameData = makeTypedFrame("known-peers", { ids: knownPeers });
                chan.send(serializeFrame(frameData));
            }
        }

        onmessage(connection, chan, evt) {
            let frameData = deserializeFrame(evt.data);
            this.handleMessage(chan, evt, frameData);
        }

        handleMessage(chan, evt, frameData) {
            let handled = onTypedFrame(frameData, "routed", data => {
                console.debug("onmessage routed", data);

                if (data.dst == this.localEndpoint.id) {
                    // message is for local peer
                    this.handleMessage(chan, evt, data.payload);
                } else {
                    // forward the data to the dst peer
                    let dstPeer = this.peerMap.get(data.dst);
                    if (dstPeer == undefined) {
                        console.warn(`can't route message, dst unknown`, data);
                    } else {
                        dstPeer.chan.send(evt.data);
                    }
                }

            }) || onTypedFrame(frameData, "known-peers", data => {
                console.debug("onmessage known-peers", data);

                // try to connect with unknown peers
                for (let id of data.ids) {
                    if (!this.peerMap.has(id) && !this.pendingConnections.has(id)) {
                        console.debug(`require connection to ${id}`);
                        this.offerRoutedConnection(chan, id);
                    }
                }

            }) || onTypedFrame(frameData, "connection-offered", data => {
                console.debug("onmessage connection-offered", data);

                // reply to the offer with an answer to establish a connection
                this.answerRoutedConnection(chan, data.srcId, data.offer);

            }) || onTypedFrame(frameData, "connection-answered", data => {
                console.debug("onmessage connection-answered", data);

                // complete the connection, add it to the hub when successfully connected
                this.completeRoutedConnection(data.srcId, data.answer);

            });

            if (!handled)
                throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
        }

        onclose(connection, chan) {
            this.peerMap.delete(connection.remoteEndpoint.id);
            this.onChange?.(this);
        }
    }

    return {
        LocalEndpoint: LocalEndpoint,
        RemoteEndpoint: RemoteEndpoint,
        PeerConnection: PeerConnection,
        ChannelHandler: ChannelHandler,
        BroadcastHandler: BroadcastHandler,
        Hub: Hub
    }
}();