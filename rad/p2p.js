/**
 * inspired from https://stackoverflow.com/questions/54980799/webrtc-datachannel-with-manual-signaling-example-please
 */

class P2PConnection {
    constructor() {
        const config = { iceServers: [{ urls: "stun:stun.1.google.com:19302" }] };
        this.pc = new RTCPeerConnection(config);

        this.isInitiator = null;

        this.pc.oniceconnectionstatechange = (evt) => {
            console.log("ice state change : ", this.pc.iceConnectionState);
        };
        this.pc.onsignalingstatechange = (evt) => {
            console.log("signaling state change : ", this.pc.signalingState);
        };
    }

    // initiator

    async createOffer() {
        if (this.isInitiator != null)
            throw new Error("already initiated");
        this.isInitiator = true;

        await this.pc.setLocalDescription(await this.pc.createOffer());
        return new Promise(resolve => {
            this.pc.onicecandidate = ({ candidate }) => {
                if (candidate != null)
                    return;
                resolve(btoa(this.pc.localDescription.sdp));
            }
        });
    }

    async consumeAnswer(peerAnswer) {
        if (this.isInitiator != true)
            throw new Error("not initiator");

        if (this.pc.signalingState != "have-local-offer")
            throw new Error("unexpected signaling state");

        console.log("answer is", atob(peerAnswer));
        this.pc.setRemoteDescription({ type: "answer", sdp: atob(peerAnswer) });
    }

    // non initiator

    async consumeOfferAndGetAnswer(peerOffer) {
        if (this.isInitiator != null)
            throw new Error("already initiated");
        this.isInitiator = false;

        if (this.pc.signalingState != "stable")
            throw new Error("unexpected signaling state");


        console.log("offer is", atob(peerOffer));
        await this.pc.setRemoteDescription({ type: "offer", sdp: atob(peerOffer) });

        await this.pc.setLocalDescription(await this.pc.createAnswer());
        return new Promise(resolve => {
            this.pc.onicecandidate = ({ candidate }) => {
                if (candidate != null)
                    return;
                resolve(btoa(this.pc.localDescription.sdp));
            }
        });
    }
}


let connection;

document.addEventListener("DOMContentLoaded", evt => {
    connection = new P2PConnection();

    const dc = connection.pc.createDataChannel("chat", { negotiated: true, id: 0 });
    dc.onopen = () => {
        for (let el of document.querySelectorAll(".initiator")) {
            el.classList.add("js-hidden");
        }
        for (let el of document.querySelectorAll(".non-initiator")) {
            el.classList.add("js-hidden");
        }
        for (let el of document.querySelectorAll(".non-initiator-2")) {
            el.classList.add("js-hidden");
        }
        for (let el of document.querySelectorAll(".success")) {
            el.classList.remove("js-hidden");
        }
    };

    log = (msg) => {
        chatLog.innerHTML += `${msg}<br>`;
    }
    chatInput.onkeypress = function (e) {
        if (e.keyCode != 13)
            return;
        try {
            dc.send(chatInput.value);
        } catch (e) {
        }
        log(`- ${chatInput.value}`);
        chatInput.value = "";
    };

    dc.onmessage = e => log(`> ${e.data}`);

    document.querySelector("#peerTag").value = "";
});

function initiate() {
    joinBtn.classList.add("js-hidden");
    initiateBtn.classList.add("js-hidden");
    for (let el of document.querySelectorAll(".initiator")) {
        el.classList.remove("js-hidden");
    }

    connection.createOffer()
        .then((offer) => {
            console.log("createOffer ok");
            document.querySelector("#offer").innerText = offer;
        })
        .catch(reason => {
            console.log("createOffer error", reason);
        });
}

function terminate() {
    let peerAnswer = document.querySelector("#peerTag").value;
    connection.consumeAnswer(peerAnswer)
        .then(() => {
            console.log("consumeAnswer ok");
        })
        .catch(reason => {
            console.log("consumeAnswer error", reason);
        });
}

function join() {
    joinBtn.classList.add("js-hidden");
    initiateBtn.classList.add("js-hidden");
    for (let el of document.querySelectorAll(".non-initiator")) {
        el.classList.remove("js-hidden");
    }
}

function reach() {
    for (let el of document.querySelectorAll(".non-initiator-2")) {
        el.classList.remove("js-hidden");
    }

    let peerOffer = document.querySelector("#peerTag").value;
    connection.consumeOfferAndGetAnswer(peerOffer)
        .then((answer) => {
            console.log("consumeOfferAndGetAnswer ok");
            document.querySelector("#answer").innerText = answer;
        })
        .catch(reason => {
            console.log("consumeOfferAndGetAnswer error", reason);
        });
}

function send(text) {
    console.log(text);
    connection.dc.send(text);
}