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