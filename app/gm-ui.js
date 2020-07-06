/**
 * This JS module implements the game user interface.
 */

"use strict";


const gmUI = function () {
    let gridSpacing = .18;
    let halfSide = (1 - gridSpacing) / 2;

    function getWidgetPos(cell) {
        let x = cell.pos.y - cell.game.height / 2 + .5;
        let y = cell.game.width / 2 - cell.pos.x - .5;
        let pos = new mt.Vect(x - halfSide, y - halfSide);
        return pos;
    }

    class Player extends gm.Player {
        constructor(name, color) {
            super(name);
            this.color = color;

            this.productionHistory = new cgraph.Dataset2D(name, color);
            this.storageHistory = new cgraph.Dataset2D(name, color);
        }

        fillHistory(turnCounter) {
            this.productionHistory.addPoint(turnCounter, this.production);
            this.storageHistory.addPoint(turnCounter, this.storage);
        }
    }

    class CellWidget extends ui.BoxWidget {
        constructor(father, game, cell) {
            super(father, getWidgetPos(cell), 1 - gridSpacing, 1 - gridSpacing);

            this.game = game;

            this.cell = cell;
            if (this.cell.widget != null)
                throw new Error("cell already owned");
            this.cell.widget = this;

            this.hovered = false;

            this.powerLabel = new ui.LabelWidget(this, new mt.Vect(this.pos.x + halfSide, this.pos.y + .32), null, lbl => `${this.cell.power}`);
            this.powerLabel.fillStyle = "#FFF8";
            this.powerLabel.fontSize = .25;
            this.powerLabel.textAlign = "center";
        }

        getPowerOpacity() {
            let maxPower = this.game.maxPower();
            let opacity;
            if (maxPower > 0) {
                opacity = this.cell.power / maxPower;
            } else {
                opacity = 1;
            }
            let maxOpacity = 0x88;
            let scaledOpacity = Math.round(opacity * maxOpacity);
            var hex = Number(scaledOpacity).toString(16);
            while (hex.length < 2) {
                hex = "0" + hex;
            }
            return hex;
        }

        getBaseColor() {
            return this.cell.owner?.color ?? "FFFFFF";
        }

        paint(sandbox) {
            sandbox.ctx.save();

            let baseColor = this.getBaseColor();

            let action = this.getClickAction();
            let hasAction = action != null;

            let isOwned = this.cell.owner != null;

            let selected = this.father.selectedBox;
            let isSelected = selected == this;
            let hover = this.hovered && hasAction;

            // draw rectangle

            if (hover || isOwned) {
                sandbox.ctx.strokeStyle = `#${baseColor}`;
            } else {
                sandbox.ctx.strokeStyle = `#${baseColor}88`;
            }

            if (hover) {
                sandbox.ctx.lineWidth = .06;
            } else {
                sandbox.ctx.lineWidth = .03;
            }

            sandbox.ctx.beginPath();
            sandbox.ctx.rect(this.pos.x, this.pos.y, this.w, this.h);
            sandbox.ctx.stroke();

            if (isSelected) {
                let innerPadding = .05;
                sandbox.ctx.lineWidth = .03;
                sandbox.ctx.setLineDash([.1]);
                sandbox.ctx.beginPath();
                sandbox.ctx.rect(this.pos.x + innerPadding, this.pos.y + innerPadding, this.w - 2 * innerPadding, this.h - 2 * innerPadding);
                sandbox.ctx.stroke();
            }

            if (isOwned) {
                sandbox.ctx.fillStyle = `#${baseColor}${this.getPowerOpacity()}`;
                sandbox.ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
            }

            // arrows

            function arrow(start, end) {
                let diff = end.minus(start).setNorm(halfSide);
                let arrStart = start.add(diff);
                let arrEnd = end.minus(diff);
                let arrDiff = arrEnd.minus(arrStart);
                let arrLeft = arrStart.add(arrDiff.rotate(-1 * Math.PI / 2));
                let arrRight = arrStart.add(arrDiff.rotate(Math.PI / 2));

                sandbox.ctx.beginPath();
                sandbox.ctx.moveTo(arrLeft.x, arrLeft.y);
                sandbox.ctx.lineTo(arrEnd.x, arrEnd.y);
                sandbox.ctx.lineTo(arrRight.x, arrRight.y);
                sandbox.ctx.fill();
            }

            // draw existing drain arrow

            if (this.cell.drainTo != null) {
                let drainToWidget = this.cell.drainTo.widget;
                let action = drainToWidget.getClickAction();
                if (drainToWidget.hovered && action != null && action.name == "remove_link")
                    sandbox.ctx.fillStyle = `#${baseColor}88`;
                else
                    sandbox.ctx.fillStyle = `#${baseColor}`;
                let cellStart = this.pos.add(new mt.Vect(halfSide, halfSide));
                let cellEnd = drainToWidget.pos.add(new mt.Vect(halfSide, halfSide));
                arrow(cellStart, cellEnd);
            }

            // draw playable drain arrow

            if (((hover && this.cell.isDrainable()) && selected == null) || isSelected) {
                for (let neighbor of this.cell.drainDsts()) {
                    if (neighbor.widget.hovered)
                        sandbox.ctx.fillStyle = `#${baseColor}`;
                    else
                        sandbox.ctx.fillStyle = `#${baseColor}88`;
                    let cellStart = this.pos.add(new mt.Vect(halfSide, halfSide));
                    let cellEnd = neighbor.widget.pos.add(new mt.Vect(halfSide, halfSide));
                    arrow(cellStart, cellEnd);
                }
            }

            sandbox.ctx.restore();

            if (this.cell.owner != null)
                this.powerLabel.paint(sandbox);
        }

        getClickAction() {
            let selected = this.father.selectedBox;
            if (selected != null) {
                if (selected.cell.drainTo == this.cell) {
                    // remove existing link
                    return {
                        "name": "remove_link",
                        "perform": () => {
                            selected.cell.undrainForTurn();
                        }
                    };
                } else {
                    // create link
                    for (let neighbor of selected.cell.drainDsts()) {
                        if (this.cell == neighbor) {
                            return {
                                "name": "add_link",
                                "perform": () => {
                                    selected.cell.drainForTurn(this.cell);
                                }
                            };
                        }
                    }
                }
            } else {
                // own the cell
                if (this.cell.isPlayable()) {
                    return {
                        "name": "own_cell",
                        "perform": () => {
                            this.cell.playForTurn();
                        }
                    };
                }
                // set the clicked cell as selected
                if (this.cell.isDrainable()) {
                    return {
                        "name": "set_selected",
                        "perform": () => {
                            this.father.selectedBox = this;
                        }
                    };
                }
            }
            return null;
        }

        clicked(pos) {
            if (this.contains(pos)) {
                let action = this.getClickAction();
                this.father.selectedBox = null;
                if (action != null) {
                    action.perform();
                    this.schedulePaint();
                    return true;
                }
            }
        }

        mouseMoved(pos) {
            let contains = this.contains(pos);
            if (contains != this.hovered) {
                this.hovered = contains;
                this.schedulePaint();
            }
        }
    }

    class GameBoard extends ui.NodeWidget {
        constructor(father, game) {
            super(father, false);

            this.selectedBox = null;
            this.game = game;

            // grid
            let width = game.height;
            let height = game.width;

            let self = this;
            function makeLabel(x, y, i) {
                let label = new ui.LabelWidget(self, new mt.Vect(x, y), `${i}`);
                label.fillStyle = "#FFFFFF22";
                label.fontSize = .4;
                label.font = "Roboto";
                label.textAlign = "center";
                return label;
            }

            for (let i = 0; i < width; i++) {
                let x = i - width / 2 + .5;
                this.addWidget(makeLabel(x, height / 2 + .2, i));
            }
            for (let j = 0; j < height; j++) {
                let y = height / 2 - j - .5;
                this.addWidget(makeLabel(-1 * width / 2 - .35, y - .1, j));
            }

            for (let cell of game.cells()) {
                this.addWidget(new CellWidget(this, game, cell));
            }
        }

        skipTurn() {
            let turn = new gm.Turn();
            this.game.playTurn(turn);
        }

        surrender() {
            if (confirm("Are you sure to surrender ?")) {
                let turn = new gm.Turn(null, null, null, true);
                this.game.playTurn(turn);
            }
        }

        clicked(pos) {
            if (this.game.terminated)
                return;
            let clickHandled = false;
            for (let child of this.children) {
                let handled = child.clicked(pos);
                if (handled)
                    clickHandled = true;
            }
            if (!clickHandled) {
                this.selectedBox = null;
                this.schedulePaint();
            }
        }
    }

    // DOM elements manipulation

    function makeStatsGridElements(game) {
        let rows = [];
        for (let player of game.players) {
            let div = page.elements().game.statsGrid;

            let playerDiv = document.createElement("div");
            playerDiv.innerText = player.name;
            div.appendChild(playerDiv);

            let productionDiv = document.createElement("div");
            productionDiv.classList.add("number");
            productionDiv.innerText = player.production;
            div.appendChild(productionDiv);

            let storageDiv = document.createElement("div");
            storageDiv.classList.add("number");
            storageDiv.innerText = player.storage;
            div.appendChild(storageDiv);

            rows.push({
                update: () => {
                    let color;
                    if (game.getCurrentPlayer() == player && game.waitForTurn) {
                        color = `#${player.color}`;
                    } else {
                        color = `#${player.color}88`;
                    }

                    if (player.hasLost) {
                        playerDiv.style.textDecoration = "line-through";
                    }
                    playerDiv.style.color = color;
                    playerDiv.innerText = player.name;
                    productionDiv.innerText = player.production;
                    storageDiv.innerText = player.storage;
                },
                remove: () => {
                    playerDiv.remove();
                    productionDiv.remove();
                    storageDiv.remove();
                }
            });
        }
        return rows;
    }

    function updateOutOfCanvasElements(game, statsGridEls) {
        let playerColor;
        if (game.waitForTurn)
            playerColor = `#${game.getCurrentPlayer().color}`;
        else
            playerColor = `#${game.getCurrentPlayer().color}88`;
        page.elements().game.playerName.set(game.getCurrentPlayer().name, playerColor);

        page.elements().game.turnCount.set(game.turnCounter);

        for (let el of statsGridEls) {
            el.update();
        }
    }

    /* Game mgt */

    let sandbox;
    let cleanup;

    function startGame(players, gridSize) {
        if (players.length <= 1)
            throw new Error("a game must have at least 2 players");

        let game = new gm.Game(players, gridSize.w, gridSize.h);

        // setup graphs
        let graphProduction = new cgraph.CGraph2D(page.elements().game.graphProduction);
        let graphStorage = new cgraph.CGraph2D(page.elements().game.graphStorage);
        for (let player of players) {
            graphProduction.addDataset(player.productionHistory);
            graphStorage.addDataset(player.storageHistory);
        }

        // setup main canvas
        sandbox = new ui.Sandbox(page.elements().sandbox);
        sandbox.unitViewed = Math.max(gridSize.w + 1, gridSize.h + 1);
        sandbox.resized();

        let board = new gmUI.GameBoard(sandbox.world, game);
        sandbox.world.addWidget(board);

        // setup DOM buttons
        let skipTurn = () => board.skipTurn();
        let surrender = () => board.surrender();
        page.elements().game.btnSkipTurn.addEventListener("click", skipTurn);
        page.elements().game.btnSurrender.addEventListener("click", surrender);
        page.elements().game.btnSurrender.disabled = false;
        page.elements().game.btnSkipTurn.disabled = false;

        // setup stats grid
        let statsGridEls = makeStatsGridElements(game);

        let lastTurn = null;
        game.onChange = game => {
            updateOutOfCanvasElements(game, statsGridEls);

            // at start of a new turn complete graphs
            if (game.turnCounter != lastTurn) {
                lastTurn = game.turnCounter;
                for (let player of players) {
                    player.fillHistory(game.turnCounter);
                }
                graphProduction.paint();
                graphStorage.paint();
            }

            if (game.terminated == false) {
                sandbox.paint();
            } else {
                page.elements().winner.textContent = game.winner?.name ?? "Nobody";
                page.elements().winner.style.color = `#${game.winner?.color ?? "FFFFFF"}`;

                page.elements().game.btnSurrender.disabled = true;
                page.elements().game.btnSkipTurn.disabled = true;
                page.elements().game.btnSkipTurn.removeEventListener("click", skipTurn);
                page.elements().game.btnSurrender.removeEventListener("click", surrender);

                page.showAfterGame();
            }
        };
        game.signalChange();

        cleanup = () => {
            console.debug(`game context cleanup`);
            sandbox.stop();
            graphProduction.stop();
            graphStorage.stop();
            for (let el of statsGridEls) {
                el.remove();
            };
        }
    }

    function reset() {
        cleanup();
    }

    return {
        Player: Player,
        CellWidget: CellWidget,
        GameBoard: GameBoard,
        startGame: startGame,
        reset: reset,
    }
}();