/**
 * Index page management
 */

"use strict";


window.addEventListener("error", function (e) {
    document.getElementById("masked_error").style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
});

window.addEventListener("unhandledrejection", function (e) {
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
                makeEl: (isYou = false) => {
                    let div = document.createElement("div");
                    document.getElementById("peer-list").appendChild(div);
                    if (!isYou) {
                        return {
                            update: (lastName, isConnected, pingDelay) => {
                                div.innerHTML = `<div class="player remote">${lastName ?? "?"}</div>`;
                                if (isConnected) {
                                    div.innerHTML += `<div>${pingDelay ?? "-"} ms</div>`;
                                } else {
                                    div.innerHTML +=
                                        `<div class="con-status ko">connection lost <i class="fas fa-times-circle"></i></div>
                                    <button class="btn" onclick="page.rmListEl(this);"><i class="fas fa-trash-alt"></i></button>`;
                                }
                            },
                            delete: () => {
                                div.remove();
                            }
                        };
                    } else {
                        return {
                            update: (lastName) => {
                                div.innerHTML = `<div class="player local">${lastName ?? "?"}</div>`;
                                div.innerHTML += `<div>you</div>`;
                            }
                        };
                    }
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
            localName: {
                get: () => {
                    return document.getElementById("local-name").value;
                },
                onChange: name => { console.debug(`local name changed to ${name}`) }
            },
            inviteLink: {
                set: url => {
                    document.getElementById("invite-link").innerText = url;
                }
            },
            signalingJoin: {
                onclick: remoteId => { console.warn("no handler defined") },
                success: () => {
                    let el = document.getElementById("signaling-join-id");
                    el.classList.add("ok");
                    setTimeout(() => {
                        el.value = "";
                        el.classList.remove("ok");
                    }, 1000);
                },
                error: () => {
                    let el = document.getElementById("signaling-join-id");
                    el.classList.add("ko");
                    setTimeout(() => { el.classList.remove("ko") }, 1000);
                }
            }
        };
        document.getElementById("local-name").onchange = () => {
            party.localName.onChange?.(party.localName.get());
        };
        document.getElementById("signaling-join-btn").onclick = () => {
            party.signalingJoin.onclick?.(document.getElementById("signaling-join-id").value);
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
            addHistory: (src, msg, isLocal) => {
                let el = document.getElementById("chat-history");

                let div = document.createElement("div");
                div.classList.add("msg");
                if (isLocal) {
                    div.classList.add("local");
                } else {
                    let divSrc = document.createElement("div");
                    divSrc.classList.add("src");
                    divSrc.innerText = src;
                    div.appendChild(divSrc);
                }


                let divData = document.createElement("div");
                divData.classList.add("data");

                divData.innerText = msg;
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
                    chat.addHistory("", chatInput.value, true);
                    chatInput.value = "";
                }
                prevent = true;
            }
            return !prevent;
        };

        let preGame = {
            gridSizeSelector: {
                get: () => {
                    let selected = document.getElementById("js-grid_size").querySelector("button.selected");
                    let size = selected.innerText;
                    if (size == "8x8") {
                        return { w: 8, h: 8 }
                    } else if (size == "6x6") {
                        return { w: 6, h: 6 }
                    } else if (size == "4x4") {
                        return { w: 4, h: 4 }
                    } else {
                        throw new Error("unexpected grid size");
                    }
                },
                onChange: size => console.debug(`gridSizeSelector changed to ${size.w}x${size.h}`),
                set: size => {
                    let innerText;
                    if (size.w == 8 && size.h == 8) {
                        innerText = "8x8";
                    } else if (size.w == 6 && size.h == 6) {
                        innerText = "6x6";
                    } else if (size.w == 4 && size.h == 4) {
                        innerText = "4x4";
                    } else {
                        throw new Error(`unexpected grid size ${size.w}x${size.h}`);
                    }
                    for (let button of document.getElementById("js-grid_size").querySelectorAll("button")) {
                        if (button.innerText == innerText) {
                            button.classList.add("selected");
                        } else {
                            button.classList.remove("selected");
                        }
                    }
                }
            },
            startButton: {
                onclick: evt => console.debug(`start button clicked`),
                setWaiting: isWaiting => {
                    let button = document.getElementById("start-button");
                    if (isWaiting) {
                        button.disabled = true;
                        button.dataset["initial"] = button.innerHTML;
                        button.innerText = "Waiting for all players";
                    } else {
                        button.innerHTML = button.dataset["initial"];
                        button.disabled = false;
                    }
                }
            },
            resetButton: {
                onclick: evt => console.debug(`reset button clicked`)
            },
            playerList: {
                makeEl: (isYou = false) => {
                    let div = document.createElement("div");
                    document.getElementById("game-players").appendChild(div);
                    return {
                        update: (name, color, isReady) => {
                            let inner = ""
                            if (isYou)
                                inner += `<div>you</div>`
                            inner += `<div class="player">${name ?? "?"}</div>`;
                            if (isReady)
                                inner += `<div class="status ok"><i class="fas fa-circle"></i></div>`;
                            else
                                inner += `<div class="status"><i class="far fa-circle"></i></div>`;
                            div.innerHTML = inner;
                        },
                        delete: () => {
                            div.remove();
                        }
                    };
                }
            }
        };
        for (let button of document.getElementById("js-grid_size").querySelectorAll("button")) {
            button.addEventListener("click", evt => {
                preGame.gridSizeSelector.onChange?.(preGame.gridSizeSelector.get());
            });
        }
        document.getElementById("start-button").onclick = evt => preGame.startButton.onclick(evt);
        document.getElementById("reset-button").onclick = evt => preGame.resetButton.onclick(evt);

        elements = {
            // complex
            content: content,
            party: party,
            game: game,
            chat: chat,
            preGame: preGame,
            // simple
            sandbox: document.getElementById("js-sandbox"),
            winner: document.getElementById("js-winner"),
            players: document.getElementById("js-players"),
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

    /* Generic controls */

    function setEnabled(element, isEnabled) {
        if (isEnabled) {
            element.classList.remove("js-hidden");
        } else {
            element.classList.add("js-hidden");
        }
    }

    function toggleEnabled(element) {
        element.classList.toggle("js-hidden");
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

    function toggleTarget(el) {
        for (let target of document.querySelectorAll(el.dataset["target"])) {
            toggleEnabled(target);
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
        selectRadio: selectRadio,
        showTab: showTab,
        toggleTarget: toggleTarget,
        toggleEnabled: toggleEnabled,
        hideTarget: hideTarget,
        copyContent: copyContent,
    }
}();