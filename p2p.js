/**
 * Peer to peer networking
 */

"use strict";


const p2p = function () {

    // Network node

    class Endpoint {
        constructor(id) {
            this.id = id;
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

            const pingChan = this.createDataChannel("p2p-ping", { negotiated: true, id: 0 });
            this.pingChanHandler = new PingChannelHandler(localEndpoint, pingChan);
            this.pingChanHandler.onPingChange = () => {
                this.onPingChange?.();
            };
            this.pingChanHandler.onStateChange = () => {
                this.onStateChange?.();
            };

            const handshakeChan = this.createDataChannel("p2p-handshake", { negotiated: true, id: 1 });
            handshakeChan.onopen = () => {
                handshakeChan.send(JSON.stringify({
                    endpoint: this.localEndpoint.serialize(),
                }));
            };
            handshakeChan.onmessage = (evt) => {
                let data = JSON.parse(evt.data);
                if (data.endpoint == undefined) {
                    throw new Error(`unexpected data received '${data}'`);
                }
                if (this.remoteEndpoint != null) {
                    throw new Error(`remote endpoint already set '${data}'`);
                }
                this.remoteEndpoint = RemoteEndpoint.deserialize(data.endpoint);
                console.debug(`remote endpoint set`);
                this.onStateChange?.();
            };
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

        createDataChannel(label, dataChannelDict) {
            if (this.isInitiator != null)
                console.error("channels must be created before initialization");
            return this.pc.createDataChannel(label, dataChannelDict);
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

    class PingChannelHandler {
        constructor(localEndpoint, channel) {
            this.localId = localEndpoint.id;

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
            let pingTimer = null;
            let pingValue = null
            let pingSendTime = null;

            channel.onopen = () => {
                this.isConnected = true;
                this.onStateChange?.(this);

                const sendPing = () => {
                    if (pingValue != null) {
                        console.debug("ping timeout");
                        this.pingTime = null;
                        this.onPingChange?.(this);
                    }

                    pingValue = mt.getRandomInt(0, 2 ** 32);
                    pingSendTime = Date.now();

                    channel.send(JSON.stringify({
                        type: "ping",
                        src: this.localId,
                        ctr: pingValue
                    }));

                    pingTimer = window.setTimeout(function () { sendPing() }, 5000);
                }
                sendPing();
            };

            channel.onmessage = evt => {
                let data = JSON.parse(evt.data);
                if (data.type == undefined || data.type != "ping") {
                    throw new Error(`unexpected data received '${data}'`);
                }

                if (data.src == undefined) {
                    throw new Error(`unexpected data received '${data}'`);
                }
                if (data.src == this.localId) {
                    // ping sent from local peer
                    if (data.ctr == pingValue) {
                        pingValue = null;
                        this.pingDelay = Date.now() - pingSendTime;
                        this.onPingChange?.(this);
                    }
                } else {
                    // ping from remote peer
                    channel.send(evt.data);
                }
            };

            channel.onclose = () => {
                this.isConnected = false;
                this.onStateChange?.(this);
                clearTimeout(pingTimer);
            };
        }
    }

    return {
        PeerConnection: PeerConnection,
        LocalEndpoint: LocalEndpoint,
        RemoteEndpoint: RemoteEndpoint
    }
}();