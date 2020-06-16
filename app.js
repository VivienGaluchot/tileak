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

        paint(sandbox) {
            sandbox.ctx.save();

            let baseColor = "FFFFFF";
            if (this.cell.owner != null) {
                baseColor = this.cell.owner.color;
            }

            let selected = this.father.selectedBox;
            let isSelected = selected == this;
            let isDrainDst = false;
            if (selected != null) {
                for (let neighbor of selected.cell.drainDsts()) {
                    if (neighbor == this.cell) {
                        isDrainDst = true;
                    }
                }
            }
            let hover = this.hovered && (this.cell.isPlayable() || this.cell.isDrainable() || isDrainDst);

            if (hover || this.cell.owner != null) {
                sandbox.ctx.strokeStyle = `#${baseColor}`;
                sandbox.ctx.fillStyle = `#${baseColor}${this.getPowerOpacity()}`;
            } else {
                sandbox.ctx.strokeStyle = `#${baseColor}88`;
                sandbox.ctx.fillStyle = `#${baseColor}44`;
            }

            if (hover || isSelected) {
                sandbox.ctx.lineWidth = .06;
            } else {
                sandbox.ctx.lineWidth = .03;
            }
            sandbox.ctx.beginPath();
            sandbox.ctx.rect(this.pos.x, this.pos.y, this.w, this.h);
            sandbox.ctx.stroke();

            if (this.cell.owner != null) {
                sandbox.ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
            }

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

            if (this.cell.drainTo != null) {
                sandbox.ctx.fillStyle = `#${baseColor}`;
                let cellStart = this.pos.add(new mt.Vect(halfSide, halfSide));
                let cellEnd = this.cell.drainTo.widget.pos.add(new mt.Vect(halfSide, halfSide));
                arrow(cellStart, cellEnd);
            }

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

        clicked(pos) {
            if (this.contains(pos)) {
                let selected = this.father.selectedBox;
                this.father.selectedBox = null;

                if (this.cell.isPlayable()) {
                    this.cell.playForTurn();
                    this.schedulePaint();
                    return true;
                }

                if (selected != null) {
                    if (selected.cell.drainTo == this.cell) {
                        // remove existing link
                        selected.cell.drainForTurn(null);
                        this.schedulePaint();
                        return true;
                    } else {
                        // create link
                        for (let neighbor of selected.cell.drainDsts()) {
                            if (this.cell == neighbor) {
                                selected.cell.drainForTurn(this.cell);
                                this.schedulePaint();
                                return true;
                            }
                        }
                    }
                }

                if (this.cell.isDrainable()) {
                    this.father.selectedBox = this;
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