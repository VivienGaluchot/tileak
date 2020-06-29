/**
 * Index page management
 */

"use strict";


window.addEventListener("error", function (e) {
    document.getElementById("masked_error").style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
});


const page = function () {
    let elements = null;

    function getElements() {
        return elements;
    }

    function setup() {
        let content = {
            preGame: document.getElementById("js-content-pre_game"),
            game: document.getElementById("js-content-game"),
            afterGame: document.getElementById("js-content-after_game")
        };

        let party = {
            localOffer: {
                set: value => {
                    document.getElementById("local-offer").innerText = value;
                },
                clear: () => {
                    document.getElementById("local-offer").innerText = "";
                }
            },
            remoteOffer: {
                get: () => {
                    return document.getElementById("remote-offer").value;
                },
                clear: () => {
                    document.getElementById("remote-offer").value = "";
                }
            },
            remoteOfferBtn: document.getElementById("remote-offer-btn"),
            localAnswer: {
                set: value => {
                    document.getElementById("local-answer").innerText = value;
                },
                clear: () => {
                    document.getElementById("local-answer").innerText = "";
                }
            },
            remoteAnswer: {
                get: () => {
                    return document.getElementById("remote-answer").value;
                },
                clear: () => {
                    document.getElementById("remote-answer").value = "";
                }
            },
            remoteAnswerBtn: document.getElementById("remote-answer-btn"),
            inviteStatus: {
                set: (value, isOk, isKo) => {
                    if (isOk != null)
                        setEnabled(document.getElementById("invite-ok"), isOk);
                    if (isKo != null)
                        setEnabled(document.getElementById("invite-ko"), isKo);
                    return document.getElementById("invite-status").innerText = value;
                }
            },
            joinStatus: {
                set: (value, isOk, isKo) => {
                    if (isOk != null)
                        setEnabled(document.getElementById("join-ok"), isOk);
                    if (isKo != null)
                        setEnabled(document.getElementById("join-ko"), isKo);
                    return document.getElementById("join-status").innerText = value;
                }
            },
            list: {
                add: el => {
                    document.getElementById("party-list").appendChild(el);
                }
            },
            tabPartyInvite: {
                disable: () => {
                    setEnabled(document.getElementById("tab-party-invite"), false);
                }
            },
            tabPartyJoin: {
                disable: () => {
                    setEnabled(document.getElementById("tab-party-join"), false);
                }
            },
            localId: {
                set: value => {
                    document.getElementById("local-id").innerText = value;
                }
            },
            localName: {
                get: () => {
                    return document.getElementById("local-name").value;
                },
                onChange: name => { console.debug(`local name changed to ${name}`) }
            }
        };
        document.getElementById("local-name").onchange = () => {
            party.localName.onChange?.(party.localName.get());
        };

        let game = {
            playerName: {
                set: (name, color) => {
                    let el = document.getElementById("js-game-player_name");
                    el.innerText = name;
                    el.style.color = color;
                }
            },
            turnCount: {
                set: ctr => {
                    document.getElementById("js-game-turn_count").innerText = ctr;
                }
            },
            statsGrid: document.getElementById("js-game-stats"),
            graphProduction: document.getElementById("js-game-graph_production"),
            graphStorage: document.getElementById("js-game-graph_storage"),
            btnSurrender: document.getElementById("js-game-surrender"),
            btnSkipTurn: document.getElementById("js-game-skip_turn")
        };

        let chat = {
            onMessage: msg => console.debug(`chat message typed : ${msg}`),
            addHistory: (src, msg) => {
                let el = document.getElementById("chat-history");

                let divSrc = document.createElement("div");
                divSrc.classList.add("src");
                divSrc.innerText = src;
                let divData = document.createElement("div");
                divSrc.classList.add("data");
                divData.innerText = msg;
                let div = document.createElement("div");
                div.classList.add("msg");
                div.appendChild(divSrc);
                div.appendChild(divData);

                var doScroll = el.scrollTop > el.scrollHeight - el.clientHeight - 1;
                el.appendChild(div);
                if (doScroll) {
                    el.scrollTop = el.scrollHeight - el.clientHeight;
                }
            }
        };
        let chatInput = document.getElementById("chat-input");
        chatInput.onkeyup = event => {
            chatInput.style.height = "1px";
            chatInput.style.height = (chatInput.scrollHeight) + "px";
        };
        chatInput.onkeypress = event => {
            let prevent = false;
            if (event.keyCode == 13) {
                if (event.shiftKey) {
                    chatInput.value = chatInput.value + "\n";
                } else if (chatInput.value != "") {
                    chat.onMessage(chatInput.value);
                    chat.addHistory("you", chatInput.value);
                    chatInput.value = "";
                }
                prevent = true;
            }
            return !prevent;
        };

        elements = {
            // complex
            content: content,
            party: party,
            game: game,
            chat: chat,
            // simple
            sandbox: document.getElementById("js-sandbox"),
            winner: document.getElementById("js-winner"),
            players: document.getElementById("js-players"),
            gridSize: document.getElementById("js-grid_size"),
        };
    }

    /* Macro controls */

    function showPreGame() {
        console.debug(`showPreGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.preGame, true);
        setEnabled(elements.content.game, false);
        setEnabled(elements.content.afterGame, false);
    }

    function showGame() {
        console.debug(`showGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.preGame, false);
        setEnabled(elements.content.game, true);
        setEnabled(elements.content.afterGame, false);
    }

    function showAfterGame() {
        console.debug(`showAfterGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.preGame, false);
        setEnabled(elements.content.game, true);
        setEnabled(elements.content.afterGame, true);
    }

    /* list mgt */

    function rmListEl(el) {
        el.parentNode.remove();
    }

    function addLocalPlayer(el) {
        let section = el.parentNode.parentNode;
        let newDiv = document.createElement("div");
        newDiv.innerHTML =
            `<input class="player local" placeholder="name" value="noname" />
            <button class="btn" onclick="page.rmListEl(this);"><i class="fas fa-trash-alt"></i></button>`;
        section.appendChild(newDiv);
    }

    /* Generic controls */

    function setEnabled(element, isEnabled) {
        if (isEnabled) {
            element.classList.remove("js-hidden");
        } else {
            element.classList.add("js-hidden");
        }
    }

    function selectRadio(el) {
        let section = el.parentNode;
        for (let button of section.querySelectorAll("button")) {
            if (button == el) {
                button.classList.add("selected");
            } else {
                button.classList.remove("selected");
            }
        }
    }

    function showTab(el) {
        selectRadio(el);
        for (let target of document.querySelectorAll(el.dataset["target"])) {
            for (let tab of target.parentElement.querySelectorAll(`.tab-content`)) {
                setEnabled(tab, false);
            }
            setEnabled(target, true);
        }
    }

    function hideTarget(el) {
        for (let target of document.querySelectorAll(el.dataset["target"])) {
            setEnabled(target, false);
        }
    }

    function copyContent(el) {
        navigator.clipboard.writeText(el.innerText)
            .then(() => {
                el.classList.add("copied");
                setTimeout(() => { el.classList.remove("copied") }, 1000);
            });
    }


    return {
        setup: setup,
        elements: getElements,
        showPreGame: showPreGame,
        showGame: showGame,
        showAfterGame: showAfterGame,
        rmListEl: rmListEl,
        addLocalPlayer: addLocalPlayer,
        selectRadio: selectRadio,
        showTab: showTab,
        hideTarget: hideTarget,
        copyContent: copyContent,
    }
}();