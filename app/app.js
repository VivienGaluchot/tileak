/**
 * This JS module is the main module.
 * It provides a user interface to the game.
 */

"use strict";


const app = function () {
    // reset the game-board component and show pregame panel
    function reset() {
        page.showPreGame();
        gmUI.reset();
    }

    // setup the application callbacks
    function setup() {
        page.setup();
        // local id
        page.elements().party.localId.set(appNet.getLocalId());

        // name field
        page.elements().party.localName.onChange = name => {
            appNet.channels.names.setLocalName(name);
        };
        appNet.channels.names.setLocalName(page.elements().party.localName.get());

        // chat 
        page.elements().chat.onMessage = msg => {
            appNet.channels.chat.broadcast(msg);
        }

        // grid size
        page.elements().preGame.gridSizeSelector.onChange = size => {
            appNet.channels.pregame.setGridSize(size);
        }
        appNet.channels.pregame.setGridSize(page.elements().preGame.gridSizeSelector.get());

        // start button
        page.elements().preGame.startButton.onclick = async evt => {
            page.elements().preGame.startButton.setWaiting(true);
            await appNet.channels.pregame.waitForStart();

            let playersId = appNet.channels.pregame.playersId();
            let state = await appNet.channels.pregame.getState();

            console.log("Go !", playersId, state);

            page.showGame();
            page.elements().preGame.startButton.setWaiting(false);

            let players = [];
            let angleIncrement = Math.min(360 / playersId.length, 120);
            for (let [index, id] of playersId.entries()) {
                let angle = -1 * angleIncrement * index;
                let color = clr.changeHue("#44FFFF", angle);
                let name = appNet.channels.names.getName(id);
                players.push(new gmUI.Player(name, color.substr(1)));
            }

            gmUI.startGame(players, state.gridSize);
        };
    }

    return {
        setup: setup,
        reset: reset,
    }
}();


document.addEventListener("DOMContentLoaded", (e) => {
    app.setup();
});