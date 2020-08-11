/**
 * This JS module is the main module.
 * It provides a user interface to the game.
 */

"use strict";


const app = function () {
    // helpers
    function getPlayerColor(index, count) {
        let angleIncrement = Math.min(360 / count, 120);
        let angle = -1 * angleIncrement * index;
        let color = clr.changeHue("#44FFFF", angle);
        return color.substr(1);
    }

    function annotatePlayers(remotePlayerIds) {
        let playerIds = Array.from(remotePlayerIds);
        playerIds.push(appNet.getLocalId());
        playerIds.sort();
        let annotated = [];
        for (let [index, playerId] of playerIds.entries()) {
            annotated.push({
                id: playerId,
                name: appNet.names.getName(playerId),
                isLocal: playerId == appNet.getLocalId(),
                color: getPlayerColor(index, playerIds.length)
            });
        }
        return annotated;
    }


    // start game
    async function start() {
        try {
            page.elements().pregame.startButton.setWaiting(true);

            let syncPoint = await appNet.pregame.waitForStart();
            let syncState = syncPoint.data;

            let annotatedPlayers = annotatePlayers(syncPoint.syncRemoteIds);

            // id -> gmUI.Player
            let playersMap = new Map();

            let players = [];
            for (let ann of annotatedPlayers) {
                let player = new gmUI.Player(ann.name, ann.isLocal, ann.color);
                playersMap.set(ann.id, player);
                players.push(player);
            }

            appNet.pregame.onPlayerTurn = (remoteId, turn) => {
                if (!playersMap.has(remoteId)) {
                    throw new Error("unexpected state");
                }
                playersMap.get(remoteId).onRemoteTurn(turn);
            };

            page.showGame();
            page.elements().pregame.startButton.setWaiting(false);

            let sendTurn = turn => appNet.pregame.sendTurn(turn);
            gmUI.startGame(players, syncState.gridSize, sendTurn);
        } catch (error) {
            console.error("could not start game", error);
            reset();
        }
    }

    // reset the game-board component and show pregame panel
    function reset() {
        page.showPreGame();
        gmUI.reset();
    }


    // setup the application callbacks
    function setup() {
        page.setup();

        // name field
        let updateLocalName = name => {
            appNet.names.setLocalName(name);
        };
        page.elements().party.localName.onChange = updateLocalName
        updateLocalName(page.elements().party.localName.get());

        // chat 
        page.elements().chat.onMessage = msg => {
            appNet.chat.broadcast(msg);
        };

        // grid size
        appNet.pregame.onGridSizeUpdate = size => {
            page.elements().pregame.gridSizeSelector.set(size);
        };
        page.elements().pregame.gridSizeSelector.onChange = size => {
            appNet.pregame.setGridSize(size);
        };
        appNet.pregame.setGridSize(page.elements().pregame.gridSizeSelector.get());

        // start button
        page.elements().pregame.startButton.onclick = evt => start();

        // reset button
        page.elements().pregame.resetButton.onclick = evt => reset();

        // signaling
        appNet.setupSignaling();
        page.elements().party.inviteLink.set(appNet.getLocalId());

        page.elements().party.signalingJoin.onclick = remoteId => {
            appNet.joinViaSignaling(remoteId)
                .then(() => page.elements().party.signalingJoin.success())
                .catch(reason => {
                    console.error(reason);
                    page.elements().party.signalingJoin.error();
                });
        };

        // player list
        let playerListEls = new Map();
        let playerReadiness = new Map();
        let updatePlayerList = playerIds => {
            // clean previous elements
            for (let [id, it] of playerListEls) {
                appNet.names.unsetOnChange(id, it.updateName);
                it.el.delete();
            }
            playerListEls = new Map();

            // update list
            let annotatedPlayers = annotatePlayers(playerIds);
            for (let ann of annotatedPlayers) {
                let isReady = playerReadiness.get(ann.id) ?? false;
                let listElement = page.elements().pregame.playerList.makeEl(ann.isLocal);
                listElement.update(ann.name, ann.color, isReady);
                let updateName = name => {
                    listElement.update(name, ann.color, isReady);
                };
                appNet.names.setOnChange(ann.id, updateName);
                let it = { el: listElement, updateName: updateName };
                playerListEls.set(ann.id, it);
            }
        };
        appNet.pregame.onPlayersChange = updatePlayerList;
        updatePlayerList([]);

        // handle waiting to start
        appNet.pregame.onPlayerWaitingChange = (playerId, isWaiting) => {
            page.elements().pregame.setLock(isWaiting);
            playerListEls.get(playerId)?.el.setReady(isWaiting);
            playerReadiness.set(playerId, isWaiting);
        };
    }

    return {
        setup: setup
    }
}();


document.addEventListener("DOMContentLoaded", (e) => {
    app.setup();
});