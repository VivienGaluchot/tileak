let connection;

function updateClipboard(newClip) {
    navigator.clipboard.writeText(newClip);
}

document.addEventListener("DOMContentLoaded", evt => {
    connection = new P2PConnection();

    connection.onStateChange = state => {
        connectionState.innerText = state;
    };
    connectionState.innerText = connection.getState();

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