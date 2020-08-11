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
            pregame: document.getElementById("js-content-pre_game"),
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
                makeEl: () => {
                    let div = document.createElement("div");

                    let playerDiv = document.createElement("div");
                    playerDiv.classList.add("player");
                    playerDiv.classList.add("remote");
                    div.appendChild(playerDiv);

                    let pingDiv = document.createElement("div");

                    let statusDiv = document.createElement("div");
                    statusDiv.classList.add("con-status");
                    statusDiv.classList.add("ko");
                    statusDiv.innerHTML = `connection lost <i class="fas fa-times-circle"></i>`;

                    let button = document.createElement("button");
                    button.classList.add("btn");
                    button.onclick = () => { page.rmParentNode(button) };
                    button.innerHTML = `<i class="fas fa-trash-alt"></i>`;

                    document.getElementById("peer-list").appendChild(div);
                    return {
                        update: (lastName, isConnected, pingDelay) => {
                            playerDiv.innerText = lastName ?? "?";
                            if (isConnected) {
                                pingDiv.innerText = `${pingDelay ?? "-"} ms`;
                                if (statusDiv.parentElement == div)
                                    div.removeChild(statusDiv);
                                if (button.parentElement == div)
                                    div.removeChild(button);
                                div.appendChild(pingDiv);
                            } else {
                                if (pingDiv.parentElement == div)
                                    div.removeChild(pingDiv);
                                div.appendChild(statusDiv);
                                div.appendChild(button);
                            }
                        },
                        delete: () => {
                            div.remove();
                        }
                    };
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
                onChange: name => { console.debug(`local name changed to ${name} `) }
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
                set: (name, color, isYou) => {
                    let el = document.getElementById("js-game-player_name");
                    el.innerText = name;
                    el.style.color = color;
                    setEnabled(document.getElementById("js-game-player_tag"), isYou);
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
            onMessage: msg => console.debug(`chat message typed: ${msg} `),
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

        let pregame = {
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
                onChange: size => console.debug(`gridSizeSelector changed to ${size.w} x${size.h} `),
                set: size => {
                    let innerText;
                    if (size.w == 8 && size.h == 8) {
                        innerText = "8x8";
                    } else if (size.w == 6 && size.h == 6) {
                        innerText = "6x6";
                    } else if (size.w == 4 && size.h == 4) {
                        innerText = "4x4";
                    } else {
                        throw new Error(`unexpected grid size ${size.w} x${size.h} `);
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
            setLock: isLocked => {
                for (let button of document.getElementById("js-grid_size").querySelectorAll("button")) {
                    button.disabled = isLocked;
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

                    if (isYou) {
                        let youDiv = document.createElement("div");
                        youDiv.innerText = "you";
                        div.appendChild(youDiv);
                    }
                    let nameDiv = document.createElement("div");
                    nameDiv.classList.add("player");
                    div.appendChild(nameDiv);
                    let statusDiv = document.createElement("div");
                    statusDiv.classList.add("status");
                    div.appendChild(statusDiv);

                    document.getElementById("game-players").appendChild(div);

                    let setReady = isReady => {
                        if (isReady) {
                            statusDiv.innerHTML = `<i class="fas fa-check-circle"></i>`;
                            statusDiv.classList.add("ok");
                        } else {
                            statusDiv.innerHTML = `<i class="far fa-circle"></i>`;
                            statusDiv.classList.remove("ok");
                        }
                    };

                    return {
                        update: (name, color, isReady) => {
                            nameDiv.innerText = name ?? "?";
                            nameDiv.style.color = `#${color} `;
                            setReady(isReady);
                        },
                        setReady: setReady,
                        delete: () => {
                            div.remove();
                        }
                    };
                }
            }
        };
        for (let button of document.getElementById("js-grid_size").querySelectorAll("button")) {
            button.addEventListener("click", evt => {
                pregame.gridSizeSelector.onChange?.(pregame.gridSizeSelector.get());
            });
        }
        document.getElementById("start-button").onclick = evt => pregame.startButton.onclick(evt);
        document.getElementById("reset-button").onclick = evt => pregame.resetButton.onclick(evt);

        elements = {
            // complex
            content: content,
            party: party,
            game: game,
            chat: chat,
            pregame: pregame,
            // simple
            sandbox: document.getElementById("js-sandbox"),
            winner: document.getElementById("js-winner"),
            players: document.getElementById("js-players"),
        };
    }

    /* Messaging */

    class UserAlert extends Error {
        constructor(level, ...params) {
            super(...params);
            showMessage(level, this.message);
        }
    }

    function showMessage(level, msg) {
        let div = document.createElement("div");
        div.classList.add("alert");
        div.classList.add(level);

        let btn = document.createElement("button");
        btn.classList.add("btn");
        btn.classList.add("dismiss");
        btn.onclick = () => { rmParentNode(btn) };
        btn.innerHTML = `<i class="fas fa-times"></i>`;
        div.appendChild(btn);

        let ctn = document.createElement("div");
        ctn.innerText = msg;
        div.appendChild(ctn);

        document.getElementById("messages").appendChild(div);
    }

    /* Macro controls */

    function showPreGame() {
        console.debug(`showPreGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.pregame, true);
        setEnabled(elements.content.game, false);
        setEnabled(elements.content.afterGame, false);
    }

    function showGame() {
        console.debug(`showGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.pregame, false);
        setEnabled(elements.content.game, true);
        setEnabled(elements.content.afterGame, false);
    }

    function showAfterGame() {
        console.debug(`showAfterGame`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setEnabled(elements.content.pregame, false);
        setEnabled(elements.content.game, true);
        setEnabled(elements.content.afterGame, true);
    }

    /* list mgt */

    function rmParentNode(el) {
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
        rmParentNode: rmParentNode,
        selectRadio: selectRadio,
        showTab: showTab,
        toggleTarget: toggleTarget,
        toggleEnabled: toggleEnabled,
        hideTarget: hideTarget,
        copyContent: copyContent,
        // errors
        showMessage: showMessage,
        UserAlert: UserAlert
    }
}();