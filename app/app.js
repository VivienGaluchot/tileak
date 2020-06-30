/**
 * This JS module is the main module.
 * It provides a user interface to the game.
 */

"use strict";


const app = function () {

    // setup a new game, start it and display the game-board component
    function startGame() {
        page.showGame();
        gmUI.startGame();
    }

    // reset the game-board component and show pregame panel
    function reset() {
        page.showPreGame();
        gmUI.reset();
    }

    // setup the application callbacks
    function setup() {
        page.setup();
        page.elements().party.localId.set(appNet.getLocalId());
        page.elements().party.localName.onChange = name => {
            appNet.channels.names.setLocalName(name);
        };
        page.elements().chat.onMessage = msg => {
            appNet.channels.chat.broadcast(msg);
        }
        page.elements().preGame.gridSizeSelector.onChange = size => {
            appNet.channels.pregame.setGridSize(size);
        }
    }

    return {
        setup: setup,
        reset: reset,
        startGame: startGame
    }
}();


document.addEventListener("DOMContentLoaded", (e) => {
    app.setup();
});