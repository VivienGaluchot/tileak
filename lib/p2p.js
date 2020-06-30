/**
 * Peer to peer networking
 */

"use strict";


const p2p = function () {

    // Frame handling

    class Frame {
        constructor(type, data) {
            this.type = type;
            this.data = data;
        }

        serialize() {
            return JSON.stringify(this);
        }

        static deserialize(rawData) {
            let obj = JSON.parse(rawData);
            if (obj.type == undefined || obj.data == undefined)
                throw new Error(`unexpected typed frame data '${JSON.stringify(obj)}'`);
            return new Frame(obj.type, obj.data);
        }
    }

    class FrameHandler {
        constructor() {
            this.typeHandlerMap = new Map();
            this.elseHandler = null;
        }

        on(type, handler) {
            if (this.typeHandlerMap.has(type))
                throw new Error(`handler already registered '${type}'`);
            this.typeHandlerMap.set(type, handler);
            return this;
        }

        else(handler) {
            if (this.elseHandler != null)
                throw new Error(`else handler already registered`);
            this.elseHandler = handler;
            return this;
        }

        handle(frame) {
            let handler = this.typeHandlerMap.get(frame.type);
            if (handler) {
                handler(frame.data);
            } else {
                this.elseHandler?.();
            }
        }
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

    class Channel {
        constructor(connection, chan) {
            this.connection = connection;
            this.chan = chan;

            // defaults callbacks

            this.onopenPending = null;

            this.onopen = (connection, chan, evt) => {
                console.debug(`onopen pending for channel ${this.label}`, evt);
                if (this.onopenPending != null)
                    throw new Error("unexpected state");
                this.onopenPending = evt;
            };
            this.onmessage = () => console.warn("no handler registered");
            this.onerror = () => console.warn("no handler registered");
            this.onclose = () => console.warn("no handler registered");


            // link to chan callbacks

            this.chan.onopen = evt => {
                console.debug(`onopen from internal channel ${this.label}`, evt);
                this.onopen(this.connection, this, evt);
            };
            this.chan.onmessage = evt => {
                // console.debug(`onmessage from internal channel ${this.label}`, evt);
                // introduce fake delay
                setTimeout(() => {
                    this.onmessage(this.connection, this, evt);
                }, 50);
            };
            this.chan.onerror = error => {
                console.debug(`onerror from internal channel ${this.label}`, error);
                this.onerror(this.connection, this, error);
            }
            this.chan.onclose = evt => {
                console.debug(`onclose from internal channel ${this.label}`, evt);
                this.onclose(this.connection, this, evt);
            };
        }

        get label() {
            return this.chan.label;
        }

        send(data) {
            this.chan.send(data);
        }

        setHandler(handler) {
            this.onopen = (connection, chan, evt) => {
                handler.onopen(connection, chan, evt);
            };
            this.onmessage = (connection, chan, evt) => {
                handler.onmessage(connection, chan, evt);
            };
            this.onerror = (connection, chan, error) => {
                handler.onerror(connection, chan, error);
            };
            this.onclose = (connection, chan, evt) => {
                handler.onclose(connection, chan, evt);
            };

            if (this.onopenPending) {
                this.onopen(this.connection, this.chan, this.onopenPending);
                this.onopenPending = null;
            }
        }
    }

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


            // web-rtc connection

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


            // channel registration

            // label -> handler
            this.channelHandlers = new Map();
            // label -> channel
            this.pendingChannels = new Map();

            this.pc.ondatachannel = evt => {
                if (!this.isInitiator) {
                    const chan = new Channel(this, evt.channel);
                    let label = chan.label;
                    if (this.channelHandlers.has(label)) {
                        let handler = this.channelHandlers.get(label);
                        chan.setHandler(handler);
                        this.channelHandlers.delete(label);
                    } else {
                        this.pendingChannels.set(label, chan);
                    }
                } else {
                    const chan = evt.channel;
                    let label = chan.label;
                    console.debug("ondatachannel", label);
                }
            }


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
                const chan = new Channel(this, this.pc.createDataChannel("p2p-handshake", { negotiated: true, id: 0 }));
                chan.setHandler(handler);
            });

            makeHandshake.then(() => {
                this.pingChanHandler.onPingChange = () => {
                    this.onPingChange?.();
                };
                this.pingChanHandler.onStateChange = () => {
                    this.onStateChange?.(this);
                };
                this.registerDataChannel("p2p-ping", this.pingChanHandler);
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

        registerDataChannel(label, handler) {
            if (this.isInitiator) {
                const chan = new Channel(this, this.pc.createDataChannel(label));
                chan.setHandler(handler);
            } else {
                if (this.pendingChannels.has(label)) {
                    const chan = this.pendingChannels.get(label);
                    chan.setHandler(handler);
                    this.pendingChannels.delete(label)
                } else {
                    this.channelHandlers.set(label, handler);
                }
            }
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
                    if (event.candidate != null && event.candidate.candidate != "") {
                        console.debug(event.candidate.candidate);
                        return;
                    }
                    let rawOffer = this.pc.localDescription.sdp;
                    // console.debug("local offer", { rawOffer });
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
            // console.debug("remote answer", { rawAnswer });
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
            // console.debug("remote offer", { rawOffer });
            await this.pc.setRemoteDescription({
                type: "offer",
                sdp: rawOffer
            });

            await this.pc.setLocalDescription();
            return new Promise(resolve => {
                this.pc.onicecandidate = event => {
                    if (event.candidate != null && event.candidate.candidate != "") {
                        console.debug(event.candidate.candidate);
                        return;
                    }
                    let rawAnswer = this.pc.localDescription.sdp;
                    // console.debug("local answer", { rawAnswer });
                    resolve(this.tagCompress(rawAnswer));
                }
            });
        }
    }

    // Channels utility

    class ChannelHandler {
        constructor() { }

        onopen(connection, chan, evt) {
            console.debug(`channel '${chan.label}' opened`);
        }

        onmessage(connection, chan, evt) { }

        onerror(connection, chan, error) {
            console.error(`channel '${chan.label}' error`, error);
        }

        onclose(connection, chan, evt) {
            console.debug(`channel '${chan.label}' closed`, chan, evt);
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

        onopen(connection, chan, evt) {
            this.chanMap.set(connection.remoteEndpoint.id, chan);
        }

        onclose(connection, chan, evt) {
            this.chanMap.delete(connection.remoteEndpoint.id);
        }
    }

    class HandshakeHandler extends ChannelHandler {
        constructor() {
            super();

            // callbacks
            this.onHandshake = remoteEndpoint => { console.warn("no handler registered") };
        }

        onopen(connection, chan, evt) {
            console.debug(`HandshakeHandler - onopen ${chan.label}`, evt);
            let frameData = {
                endpoint: connection.localEndpoint.serialize()
            };
            chan.send(JSON.stringify(frameData));
        }

        onmessage(connection, chan, evt) {
            console.debug(`HandshakeHandler - onmessage ${chan.label}`, evt);
            let frameData = JSON.parse(evt.data);
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
                console.debug(`ping received in ${this.pingDelay ?? "-"} ms`);
            };

            // internals
            this.pingTimer = null;
            this.pingValue = null
            this.pingSendTime = null;
        }

        onopen(connection, chan, evt) {
            const sendPing = () => {
                if (this.pingValue != null) {
                    console.debug("ping timeout");
                    this.pingTime = null;
                    this.onPingChange?.(this);
                }

                this.pingValue = mt.getRandomInt(0, 2 ** 32);
                this.pingSendTime = Date.now();

                let frameData = new Frame("ping",
                    {
                        src: connection.localEndpoint.id,
                        ctr: this.pingValue
                    });
                chan.send(frameData.serialize());

                this.pingTimer = window.setTimeout(function () { sendPing() }, 5000);
            }
            sendPing();
        }

        onmessage(connection, chan, evt) {
            let frameData = Frame.deserialize(evt.data);
            let handler = new FrameHandler()
                .on("ping", data => {
                    if (data.src == undefined) {
                        throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
                    }
                    if (data.src == connection.localEndpoint.id) {
                        // ping sent from local peer
                        if (data.ctr == this.pingValue) {
                            this.pingValue = null;
                            this.pingDelay = Date.now() - this.pingSendTime;
                            if (this.isConnected == false) {
                                this.isConnected = true;
                                this.onStateChange?.(this);
                            }
                            this.onPingChange?.(this);
                        }
                    } else {
                        // ping from remote peer
                        chan.send(evt.data);
                    }
                })
                .else(() => {
                    throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
                });

            handler.handle(frameData);
        }

        onclose(connection, chan, evt) {
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
            // remote id -> {connection, chan}
            this.peerMap = new Map();

            // remote id -> connection
            this.pendingConnections = new Map();

            // callbacks

            this.onChange = hub => {
                console.debug("hub update, known hosts are");
                for (let con of this.connections()) {
                    console.debug(`- ${con.remoteEndpoint.id}`);
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

        * channels() {
            for (let [id, peer] of this.peerMap) {
                yield peer.chan;
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
            let frameData = new Frame("routed", routedData)
            chan.send(frameData.serialize());
            console.debug("send routed data", frameData);
        }

        // auto connection handling

        // TODO fix concurrency errors
        // * when two already connected groups merge togethers
        //   - Error: endpoint already registered 6bf6c1adfde3d66abbbf847f3f8cdd31 p2p.js:416:23
        //   - Error: unexpected state p2p.js:493:23

        offerRoutedConnection(chan, targetId) {
            if (this.pendingConnections.has(targetId))
                throw new Error("unexpected state");

            let connection = new PeerConnection(this.localEndpoint);
            this.pendingConnections.set(targetId, connection);

            connection.onStateChange = () => {
                if (connection.isConnected) {
                    console.debug(`auto connected to peer ${connection.remoteEndpoint.id}`);
                    this.pendingConnections.delete(targetId);
                    connection.onStateChange = null;
                    this.onAutoConnect(connection);
                }
            }

            connection.createOffer()
                .then((offer) => {
                    console.debug("createOffer ok");
                    // send the offer to targetId via a common peer
                    let offerData = {
                        srcId: this.localEndpoint.id,
                        offer: offer
                    };
                    this.sendRouted(chan, targetId, new Frame("connection-offered", offerData));
                })
                .catch(reason => {
                    console.error("createOffer error", reason);
                    this.pendingConnections.delete(targetId);
                });
        }

        answerRoutedConnection(chan, targetId, offer) {
            if (this.pendingConnections.has(targetId))
                throw new Error("unexpected state");

            let connection = new PeerConnection(this.localEndpoint);
            this.pendingConnections.set(targetId, connection);

            connection.onStateChange = () => {
                if (connection.isConnected) {
                    console.debug(`auto connected to peer ${connection.remoteEndpoint.id}`);
                    this.pendingConnections.delete(targetId);
                    connection.onStateChange = null;
                    this.onAutoConnect(connection);
                }
            }

            connection.consumeOfferAndGetAnswer(offer)
                .then(answer => {
                    console.debug("consumeOfferAndGetAnswer ok");
                    // send back the answer to targetId via a common peer
                    let answerData = {
                        srcId: this.localEndpoint.id,
                        answer: answer
                    };
                    this.sendRouted(chan, targetId, new Frame("connection-answered", answerData));
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

        broadcast(data) {
            for (let chan of this.channels()) {
                chan.send(data);
            }
        }

        onopen(connection, chan, evt) {
            this.addConnection(connection, chan);

            // share the hub peers list with the new peer
            let hubPeers = Array.from(this.peersId());
            if (hubPeers.length > 0) {
                let frameData = new Frame("known-peers", { ids: hubPeers });
                console.debug(`known-peers sent to ${connection.remoteEndpoint.id}`, frameData)
                chan.send(frameData.serialize());
            }

            // share the new peer id with all the hub
            let newPeerFrame = new Frame("known-peers", { ids: [connection.remoteEndpoint.id] });
            console.debug(`known-peers broadcasted ${connection.remoteEndpoint.id}`, newPeerFrame)
            this.broadcast(newPeerFrame.serialize());

            // peers will then be in change to initiate the connections between then through a common peer if needed
        }

        onmessage(connection, chan, evt) {
            let frameData = Frame.deserialize(evt.data);

            this.handleMessage(chan, evt, frameData);
        }

        handleMessage(chan, evt, frameData) {
            let handler = new FrameHandler()
                .on("routed", data => {
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
                })
                .on("known-peers", data => {
                    console.debug("onmessage known-peers", data);

                    // try to connect with unknown peers
                    for (let id of data.ids) {
                        if (this.localEndpoint.id == id) {
                            console.debug(`don't require connection to ${id}, local id`);
                        } else if (this.peerMap.has(id)) {
                            console.debug(`don't require connection to ${id}, already known`);
                        } else if (this.pendingConnections.has(id)) {
                            console.debug(`don't require connection to ${id}, pending connection`);
                        } else {
                            if (id < this.localEndpoint.id) {
                                console.debug(`require connection to ${id}, initiate it`);
                                this.offerRoutedConnection(chan, id);
                            } else {
                                console.debug(`require connection to ${id}, waiting for it`);
                            }
                        }
                    }
                })
                .on("connection-offered", data => {
                    console.debug("onmessage connection-offered", data);

                    // reply to the offer with an answer to establish a connection
                    this.answerRoutedConnection(chan, data.srcId, data.offer);
                })
                .on("connection-answered", data => {
                    console.debug("onmessage connection-answered", data);

                    // complete the connection, add it to the hub when successfully connected
                    this.completeRoutedConnection(data.srcId, data.answer);
                })
                .else(() => {
                    throw new Error(`unexpected data received '${JSON.stringify(data)}'`);
                });
            handler.handle(frameData);
        }

        onclose(connection, chan, evt) {
            this.peerMap.delete(connection.remoteEndpoint.id);
            this.onChange?.(this);
        }
    }

    return {
        Frame: Frame,
        FrameHandler: FrameHandler,
        LocalEndpoint: LocalEndpoint,
        RemoteEndpoint: RemoteEndpoint,
        PeerConnection: PeerConnection,
        ChannelHandler: ChannelHandler,
        BroadcastHandler: BroadcastHandler,
        Hub: Hub
    }
}();