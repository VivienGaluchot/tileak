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

            console.log("Go !");
            page.elements().preGame.startButton.setWaiting(false);

            // page.showGame();
            // gmUI.startGame();
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