const p2p = function () {

    class PeerConnection {
        constructor() {
            const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
            this.pc = new RTCPeerConnection(config);

            this.isInitiator = null;

            this.onStateChange = null;
            this.onPingChange = () => {
                console.debug(`ping received in ${this.pingDelay} ms`);
            };

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

            // mgt channel

            this.isConnected = false;

            let pingTimer = null;
            let pingValue = null
            let pingSendTime = null;
            this.pingDelay = null;

            const pingChannel = this.pc.createDataChannel("p2p-ping", { negotiated: true, id: 0 });
            pingChannel.onopen = () => {
                console.debug("ping channel opened");
                this.isConnected = true;
                this.onStateChange?.(this);

                let self = this;
                function sendPing() {
                    if (pingValue != null) {
                        console.debug("ping timeout");
                        this.pingTime = null;
                        this.onPingChange?.(this);
                    }

                    pingValue = mt.getRandomInt(0, 2 ** 32);
                    pingSendTime = Date.now();

                    let pingData = { initiator: self.isInitiator, ctr: pingValue };
                    pingChannel.send(JSON.stringify(pingData));

                    pingTimer = window.setTimeout(function () { sendPing() }, 5000);
                }
                sendPing();
            };

            pingChannel.onmessage = evt => {
                let data = JSON.parse(evt.data);
                if (data.initiator != undefined) {
                    if (data.initiator == this.isInitiator) {
                        // ping sent from local peer
                        if (data.ctr == pingValue) {
                            pingValue = null;
                            this.pingDelay = Date.now() - pingSendTime;
                            this.onPingChange?.(this);
                        }
                    } else {
                        // ping from remote peer
                        pingChannel.send(evt.data);
                    }
                } else {
                    console.debug("unexpected data received", evt.data);
                }
            };

            pingChannel.onclose = () => {
                clearTimeout(pingTimer);
            };

            // tag compression

            this.tagCompress = tag => LZString.compressToBase64(tag);
            this.tagDecompress = tag => LZString.decompressFromBase64(tag);
        }

        // monitoring

        getStateDetails() {
            return `${this.pc.iceConnectionState} ${this.pc.signalingState}`;
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

    return {
        PeerConnection: PeerConnection
    }
}();