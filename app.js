const app = function () {
    let gridSpacing = .12;
    let halfSide = (1 - gridSpacing) / 2;

    function getWidgetPos(cell) {
        let x = cell.pos.y - cell.game.height / 2 + .5;
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

    class BoxWidget extends ui.BoxWidget {
        constructor(father, game, cell) {
            super(father, getWidgetPos(cell), 1 - gridSpacing, 1 - gridSpacing);

            this.game = game;

            this.cell = cell;
            if (this.cell.widget != null)
                throw new Error("cell already owned");
            this.cell.widget = this;

            this.hovered = false;

            this.powerLabel = new ui.LabelWidget(this, new mt.Vect(this.pos.x + halfSide, this.pos.y + .35), null, lbl => `${cell.power}`);
            this.powerLabel.fillStyle = "#FFF8";
            this.powerLabel.fontSize = .3;
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
                if (drainToWidget.hovered && drainToWidget.getClickAction() != null)
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
                label.fillStyle = "#FFF2";
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
                this.addWidget(new BoxWidget(this, game, cell));
            }

            // player label

            let playerPreLabel = new ui.LabelWidget(this, new mt.Vect(-.5 * game.height, -1 * game.width / 2 - 1), 'Player');
            playerPreLabel.fontSize = .5;
            playerPreLabel.textAlign = "left";
            playerPreLabel.fillStyle = "#FFF2";
            playerPreLabel.font = "Roboto";
            playerPreLabel.fontWeight = "lighter";
            this.addWidget(playerPreLabel);

            let playerLabel = new ui.LabelWidget(this, new mt.Vect(-.5 * game.height + 2, -1 * game.width / 2 - 1), '-');
            playerLabel.fontSize = .5;
            playerLabel.textAlign = "left";
            playerLabel.font = "Roboto";
            this.addWidget(playerLabel);
            function updatePlayerLabel(game) {
                if (game.waitForTurn)
                    playerLabel.fillStyle = `#${game.getCurrentPlayer().color}`;
                else
                    playerLabel.fillStyle = `#${game.getCurrentPlayer().color}88`;
                playerLabel.text = game.getCurrentPlayer().name;
            }
            updatePlayerLabel(game);

            // turn label

            let turnPreLabel = new ui.LabelWidget(this, new mt.Vect(-.5 * game.height, -1 * game.width / 2 - 2), 'Turn');
            turnPreLabel.fontSize = .5;
            turnPreLabel.textAlign = "left";
            turnPreLabel.fillStyle = "#FFF2";
            turnPreLabel.font = "Roboto";
            turnPreLabel.fontWeight = "lighter";
            this.addWidget(turnPreLabel);

            let turnLabel = new ui.LabelWidget(this, new mt.Vect(-.5 * game.height + 2, -1 * game.width / 2 - 2), null, label => game.turnCounter);
            turnLabel.fontSize = .5;
            turnLabel.textAlign = "left";
            turnLabel.font = "Roboto";
            this.addWidget(turnLabel);


            // skip button

            let button = new ui.ButtonWidget(this, new mt.Vect(.5 * game.height - 1.5, -1 * game.width / 2 - 1 - .2), 1.5, .7, "skip", .2);
            button.label.fontSize = .4;
            button.label.font = "Roboto";
            button.label.fontWeight = "lighter";
            button.onClick = btn => {
                let turn = new gm.Turn();
                game.playTurn(turn);
            };
            this.addWidget(button);


            // on change

            game.onChange = game => {
                updatePlayerLabel(game);
            };
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

    // Main function

    function main() {
        let a = new Player("Alice", "00FFFF");
        let b = new Player("Bob", "FFFF00");
        let players = [a, b];
        let game = new gm.Game(players, 8, 8);

        let sandbox = new ui.Sandbox(document.getElementById("sandbox"));
        sandbox.world.addWidget(new GameBoard(sandbox.world, game));

        let initOnchange = game.onChange;
        game.onChange = game => {
            initOnchange(game);
            sandbox.paint();
        };

        sandbox.paint();
    }

    return {
        main: main
    }
}();

window.addEventListener("error", function (e) {
    document.getElementById("masked_error").style.display = "block";
    return false;
});

document.addEventListener("DOMContentLoaded", (e) => {
    app.main();
});