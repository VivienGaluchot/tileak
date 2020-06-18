/**
 * This JS module is the main module.
 * It provides a user interface to the game.
 */

const app = function () {
    let gridSpacing = .18;
    let halfSide = (1 - gridSpacing) / 2;
    let xOffset = -2;

    function getWidgetPos(cell) {
        let x = cell.pos.y - cell.game.height / 2 + .5 + xOffset;
        let y = cell.game.width / 2 - cell.pos.x - .5;
        let pos = new mt.Vect(x - halfSide, y - halfSide);
        return pos;
    }

    // Game specialization

    class Player extends gm.Player {
        constructor(name, color) {
            super(name);
            this.color = color;
        }
    }

    // UI elements

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
            if (this.cell.owner != null) {
                return this.cell.owner.color;
            } else {
                return "FFFFFF";
            }
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
                        "perform": _ => {
                            selected.cell.undrainForTurn();
                        }
                    };
                } else {
                    // create link
                    for (let neighbor of selected.cell.drainDsts()) {
                        if (this.cell == neighbor) {
                            return {
                                "name": "add_link",
                                "perform": _ => {
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
                        "perform": _ => {
                            this.cell.playForTurn();
                        }
                    };
                }
                // set the clicked cell as selected
                if (this.cell.isDrainable()) {
                    return {
                        "name": "set_selected",
                        "perform": _ => {
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

    class PlayerStat extends ui.NodeWidget {
        constructor(father, game, player, pos) {
            super(father);
            this.pos = pos;
            this.game = game;
            this.player = player;

            // name label
            this.nameLabel = new ui.LabelWidget(this, this.pos, null, label => this.player.name);
            this.nameLabel.fontSize = .3;
            this.nameLabel.textAlign = "left";
            this.nameLabel.font = "Roboto";
            this.addWidget(this.nameLabel);

            // production label
            this.productionLabel = new ui.LabelWidget(this, this.pos.add(new mt.Vect(2.5, 0)), null, label => this.player.production);
            this.productionLabel.fontSize = .3;
            this.productionLabel.textAlign = "right";
            this.productionLabel.fillStyle = `#FFFFFF88`
            this.productionLabel.font = "Roboto";
            this.addWidget(this.productionLabel);

            // storage label
            this.storageLabel = new ui.LabelWidget(this, this.pos.add(new mt.Vect(4, 0)), null, label => this.player.storage);
            this.storageLabel.fontSize = .3;
            this.storageLabel.textAlign = "right";
            this.storageLabel.fillStyle = `#FFFFFF88`
            this.storageLabel.font = "Roboto";
            this.addWidget(this.storageLabel);
        }

        paint(sandbox) {
            if (this.player.hasSurrender) {
                this.nameLabel.fillStyle = `#FFFFFF44`;
            } else if (this.game.getCurrentPlayer() == this.player && this.game.waitForTurn) {
                this.nameLabel.fillStyle = `#${this.player.color}`;
            } else {
                this.nameLabel.fillStyle = `#${this.player.color}88`;
            }
            super.paint(sandbox);
        }
    }

    class CurrentPlayerLabel extends ui.LabelWidget {
        constructor(father, pos, game) {
            super(father, pos, null, _ => game.getCurrentPlayer().name);
            this.game = game;
        }

        paint(sandbox) {
            if (this.game.waitForTurn)
                this.fillStyle = `#${this.game.getCurrentPlayer().color}`;
            else
                this.fillStyle = `#${this.game.getCurrentPlayer().color}88`;
            super.paint(sandbox);
        }
    }

    class PlayerStats extends ui.NodeWidget {
        constructor(father, game) {
            super(father);
            this.game = game;

            let pos = new mt.Vect(.5 * game.height + 1 + xOffset, game.width / 2 + .2);

            // player label
            let playerPreLabel = new ui.LabelWidget(this, pos, "Player");
            playerPreLabel.fontSize = .5;
            playerPreLabel.textAlign = "left";
            playerPreLabel.fillStyle = "#FFFFFF88";
            playerPreLabel.font = "Roboto";
            playerPreLabel.fontWeight = "lighter";
            this.addWidget(playerPreLabel);

            let playerLabel = new CurrentPlayerLabel(this, pos.add(new mt.Vect(1.8, 0)), game);
            playerLabel.fontSize = .5;
            playerLabel.textAlign = "left";
            playerLabel.font = "Roboto";
            this.addWidget(playerLabel);

            pos = pos.add(new mt.Vect(0, -.8));

            // turn label
            let turnPreLabel = new ui.LabelWidget(this, pos, "Turn");
            turnPreLabel.fontSize = .5;
            turnPreLabel.textAlign = "left";
            turnPreLabel.fillStyle = "#FFFFFF88";
            turnPreLabel.font = "Roboto";
            turnPreLabel.fontWeight = "lighter";
            this.addWidget(turnPreLabel);

            let turnLabel = new ui.LabelWidget(this, pos.add(new mt.Vect(1.8, 0)), null, label => game.turnCounter);
            turnLabel.fontSize = .5;
            turnLabel.textAlign = "left";
            turnLabel.font = "Roboto";
            this.addWidget(turnLabel);

            pos = pos.add(new mt.Vect(0, -1));

            // stat table

            // production title
            this.productionLabel = new ui.LabelWidget(this, pos.add(new mt.Vect(2.5, 0)), "production");
            this.productionLabel.fontSize = .2;
            this.productionLabel.textAlign = "right";
            this.productionLabel.fillStyle = `#FFFFFF88`
            this.productionLabel.font = "Roboto";
            this.addWidget(this.productionLabel);
            // storage title
            this.storageLabel = new ui.LabelWidget(this, pos.add(new mt.Vect(4, 0)), "storage");
            this.storageLabel.fontSize = .2;
            this.storageLabel.textAlign = "right";
            this.storageLabel.fillStyle = `#FFFFFF88`
            this.storageLabel.font = "Roboto";
            this.addWidget(this.storageLabel);
            // lines
            for (let [index, player] of game.players.entries()) {
                let stats = new PlayerStat(this, game, player, pos.add(new mt.Vect(0, -.6 * index - .5)));
                this.addWidget(stats);
            }
        }
    }

    class GameBoard extends ui.NodeWidget {
        constructor(father, game) {
            super(father, false);

            this.selectedBox = null;

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
                let x = i - width / 2 + .5 + xOffset;
                this.addWidget(makeLabel(x, height / 2 + .2, i));
            }
            for (let j = 0; j < height; j++) {
                let y = height / 2 - j - .5;
                this.addWidget(makeLabel(-1 * width / 2 - .35 + xOffset, y - .1, j));
            }

            for (let cell of game.cells()) {
                this.addWidget(new CellWidget(this, game, cell));
            }

            // skip button
            let skipButton = new ui.ButtonWidget(this, new mt.Vect(.5 * game.height - 2 + xOffset, -1 * game.width / 2 - 1 - .2), 2, .7, "Skip turn", .25);
            skipButton.label.fontSize = .3;
            skipButton.label.font = "Roboto";
            skipButton.label.fontWeight = "lighter";
            skipButton.onClick = btn => {
                let turn = new gm.Turn();
                game.playTurn(turn);
            };
            this.addWidget(skipButton);

            // surrender button
            let surrenderButton = new ui.ButtonWidget(this, new mt.Vect(.5 * game.height - 4.2 + xOffset, -1 * game.width / 2 - 1 - .2), 2, .7, "Surrender", .25);
            surrenderButton.label.fontSize = .3;
            surrenderButton.label.font = "Roboto";
            surrenderButton.label.fontWeight = "lighter";
            surrenderButton.onClick = btn => {
                if (confirm("Are you sure to surrender ?")) {
                    let turn = new gm.Turn(null, null, null, true);
                    game.playTurn(turn);
                }
            };
            this.addWidget(surrenderButton);

            // player stats
            let stats = new PlayerStats(this, game);
            this.addWidget(stats);
        }

        clicked(pos) {
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

    let el_html;
    let el_pre_game;
    let el_sandbox;
    let el_after_game;
    let el_winner;
    let el_players;
    let el_grid_size;

    function setup() {
        el_html = document.querySelector("html");
        el_pre_game = document.getElementById("js-content-pre_game");
        el_sandbox = document.getElementById("js-sandbox");
        el_after_game = document.getElementById("js-content-after_game");
        el_winner = document.getElementById("js-winner");
        el_players = document.getElementById("js-players");
        el_grid_size = document.getElementById("js-grid_size");
    }

    function reset() {
        showPreGame();
    }

    function setEnabled(element, isEnabled) {
        if (isEnabled) {
            element.classList.remove("disabled");
            element.classList.add("enabled");
        } else {
            element.classList.remove("enabled");
            element.classList.add("disabled");
        }
    }

    function showPreGame() {
        el_html.classList.remove("sandbox-enabled");
        setEnabled(el_pre_game, true);
        setEnabled(el_sandbox, false);
        setEnabled(el_after_game, false);
    }

    function showSandbox() {
        el_html.classList.add("sandbox-enabled");
        setEnabled(el_pre_game, false);
        setEnabled(el_sandbox, true);
        setEnabled(el_after_game, false);
    }

    function showAfterGame() {
        el_html.classList.remove("sandbox-enabled");
        setEnabled(el_pre_game, false);
        setEnabled(el_sandbox, false);
        setEnabled(el_after_game, true);
    }

    /* Inputs */

    function makePlayers() {
        let players = [];
        let inputs = el_players.querySelectorAll("div>input");
        let angleIncrement = Math.min(360 / inputs.length, 120);
        for (let [index, input] of inputs.entries()) {
            let angle = -1 * angleIncrement * index;
            let color = clr.changeHue("#44FFFF", angle);
            players.push(new Player(input.value, color.substr(1)));
        }
        return players;
    }

    function getSelectedGridSize() {
        let selected = el_grid_size.querySelector("button.selected");
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
    }

    /* Game mgt */

    let sandbox;

    function startGame() {
        let players = makePlayers();
        let gridSize = getSelectedGridSize();
        if (players.length > 1) {
            showSandbox();
            let game = new gm.Game(players, gridSize.w, gridSize.h);

            sandbox = new ui.Sandbox(el_sandbox);
            sandbox.world.addWidget(new GameBoard(sandbox.world, game));

            game.onChange = game => {
                if (game.terminated == false) {
                    sandbox.paint();
                } else {
                    sandbox.stop();
                    if (game.winner != null) {
                        el_winner.textContent = game.winner.name;
                        el_winner.style.color = `#${game.winner.color}`
                    } else {
                        el_winner.textContent = "Nobody";
                        el_winner.style.color = `#FFFFFF`
                    }
                    showAfterGame();
                }
            };
            game.signalChange();
        }
    }

    function rmInput(el) {
        el.parentNode.remove();
    }

    function addInput(el) {
        let div = el.parentNode;
        let section = div.parentNode;
        let newDiv = document.createElement("div");
        newDiv.innerHTML = "<input value=\"noname\"/><button onclick=\"app.rmInput(this);\">-</button>"
        section.insertBefore(newDiv, div);
    }

    function selectGridSize(el) {
        let section = el.parentNode;
        for (let button of section.querySelectorAll("button")) {
            if (button == el) {
                button.classList.add("selected");
            } else {
                button.classList.remove("selected");
            }
        }
    }

    return {
        setup: setup,
        reset: reset,
        startGame: startGame,
        rmInput: rmInput,
        addInput: addInput,
        selectGridSize: selectGridSize,
    }
}();

window.addEventListener("error", function (e) {
    document.getElementById("masked_error").style.display = "block";
    return false;
});

document.addEventListener("DOMContentLoaded", (e) => {
    app.setup();
});