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
            throw new Error(`unexpected typed frame data ${frameData}`);
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
            };;
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
                throw new Error(`unexpected data received '${data}'`);
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
                throw new Error(`unexpected data received '${frameData}'`);
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
                    throw new Error(`unexpected data received '${data}'`);
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
                throw new Error(`unexpected data received '${data}'`);
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
            this.peerMap = new Map();

            this.pendingInitiatedConnections = [];

            // callbacks

            this.onChange = hub => {
                console.debug("hub update");
                for (let con of this.connections()) {
                    console.debug(con.remoteEndpoint.id);
                }
            };
        }

        addConnection(connection) {
            if (connection.localEndpoint.id != this.localEndpoint.id) {
                throw new Error("unexpected local endpoint");
            }
            if (this.peerMap.has(connection.remoteEndpoint.id)) {
                throw new Error(`endpoint already registered ${connection.remoteEndpoint.id}`);
            }
            this.peerMap.set(connection.remoteEndpoint.id, connection);
            this.onChange?.(this);
        }

        * connections() {
            for (let [id, connection] of this.peerMap) {
                yield connection;
            }
        }

        * peersId() {
            for (let con of this.connections()) {
                yield con.remoteEndpoint.id;
            }
        }

        // connection handling

        sendRoutedOffer(connection, chan, targetId) {
            let pendingConnection = new PeerConnection(connection.localDescription);
            pendingConnection.createOffer()
                .then((offer) => {
                    console.debug("createOffer ok");
                    // TODO send the offer to targetId via a common peer
                })
                .catch(reason => {
                    console.error("createOffer error", reason);
                });
        }

        // channel handling

        onopen(connection, chan) {
            this.addConnection(connection);

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

            let handled = onTypedFrame(frameData, "routed", data => {
                // TODO forward the data to the dest

            }) || onTypedFrame(frameData, "known-peers", data => {
                console.debug("known-peers frame received", data);
                for (let id of data.ids) {
                    if (!this.peerMap.has(id)) {
                        console.debug(`require connection to ${id}`);
                        this.sendRoutedOffer(connection, chan, id);
                    }
                }

            }) || onTypedFrame(frameData, "connection-offered", data => {
                // TODO reply to the offer with an answer to establish a connection

            }) || onTypedFrame(frameData, "connection-answered", data => {
                // TODO complete the connection, add it to the hub when successfully connected

            });

            if (!handled)
                throw new Error(`unexpected data received '${data}'`);
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
        Hub: Hub
    }
}();