class P2PConnection {
    constructor() {
        const config = { iceServers: [{ urls: "stun:stun.1.google.com:19302" }] };
        this.pc = new RTCPeerConnection(config);

        this.isInitiator = null;

        this.onStateChange = (state) => { };

        this.pc.oniceconnectionstatechange = (evt) => {
            console.log("ice state change : ", this.pc.iceConnectionState);
            this.onStateChange(this.getState());
        };
        this.pc.onsignalingstatechange = (evt) => {
            console.log("signaling state change : ", this.pc.signalingState);
            this.onStateChange(this.getState());
        };
        this.pc.addEventListener("negotiationneeded", event => {
            console.log("negotiation needed");
        });

        this.tagCompress = tag => LZString.compressToBase64(tag);
        this.tagDecompress = tag => LZString.decompressFromBase64(tag);
    }

    // monitoring

    getState() {
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
            this.pc.onicecandidate = ({ candidate }) => {
                if (candidate != null)
                    return;
                resolve(this.tagCompress(this.pc.localDescription.sdp));
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

        this.pc.setRemoteDescription({ type: "answer", sdp: this.tagDecompress(peerAnswer) });
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

        await this.pc.setRemoteDescription({ type: "offer", sdp: this.tagDecompress(peerOffer) });

        // await this.pc.setLocalDescription(await this.pc.createAnswer());
        await this.pc.setLocalDescription();
        return new Promise(resolve => {
            this.pc.onicecandidate = ({ candidate }) => {
                if (candidate != null)
                    return;
                resolve(this.tagCompress(this.pc.localDescription.sdp));
            }
        });
    }
}