const app = function () {
    let gridSpacing = .15;
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

    class CellWidget extends ui.BoxWidget {
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

            let hover = this.hovered && (this.cell.isPlayable() || this.cell.isDrainable());
            let selected = this.game.selectedCell;

            if (hover || this.cell.owner != null) {
                sandbox.ctx.strokeStyle = `#${baseColor}`;
                sandbox.ctx.fillStyle = `#${baseColor}${this.getPowerOpacity()}`;
            } else {
                sandbox.ctx.strokeStyle = `#${baseColor}88`;
                sandbox.ctx.fillStyle = `#${baseColor}44`;
            }

            if (hover || selected == this.cell) {
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

            if (((hover && this.cell.isDrainable()) && selected == null) || selected == this.cell) {
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
                if (this.cell.isPlayable()) {
                    this.cell.playForTurn();
                    this.schedulePaint();
                    return;
                }

                let selected = this.game.selectedCell;
                if (selected != null) {
                    if (selected.drainTo == this.cell) {
                        // remove existing link
                        selected.drainForTurn(null);
                        this.schedulePaint();
                        return;
                    } else {
                        // create link
                        for (let neighbor of selected.drainDsts()) {
                            if (this.cell == neighbor) {
                                selected.drainForTurn(this.cell);
                                this.schedulePaint();
                                return;
                            }
                        }
                    }
                }

                if (this.cell.isDrainable()) {
                    this.cell.selectForDrain();
                    this.schedulePaint();
                    return;
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

    // Ui Setup

    function makeGrid(game, world) {
        let width = game.height;
        let height = game.width;

        function makeLabel(x, y, i) {
            let label = new ui.LabelWidget(world, new mt.Vect(x, y), `${i}`);
            label.fillStyle = "#FFF2";
            label.fontSize = .4;
            label.font = "Roboto";
            label.textAlign = "center";
            return label;
        }

        for (let i = 0; i < width; i++) {
            let x = i - width / 2 + .5;
            world.addWidget(makeLabel(x, height / 2 + .2, i));
        }
        for (let j = 0; j < height; j++) {
            let y = height / 2 - j - .5;
            world.addWidget(makeLabel(-1 * width / 2 - .35, y - .1, j));
        }

        for (let cell of game.cells()) {
            world.addWidget(new CellWidget(world, game, cell));
        }
    }

    function makePlayerLabel(game, world) {
        let playerPreLabel = new ui.LabelWidget(world, new mt.Vect(-.5 * game.height, -1 * game.width / 2 - 1), 'Player');
        playerPreLabel.fontSize = .5;
        playerPreLabel.textAlign = "left";
        playerPreLabel.fillStyle = "#FFF2";
        playerPreLabel.font = "Roboto";
        playerPreLabel.fontWeight = "lighter";
        world.addWidget(playerPreLabel);

        let playerLabel = new ui.LabelWidget(world, new mt.Vect(-.5 * game.height + 2, -1 * game.width / 2 - 1), '-');
        playerLabel.fontSize = .5;
        playerLabel.textAlign = "left";
        playerLabel.font = "Roboto";
        world.addWidget(playerLabel);
        function updatePlayerLabel(game) {
            if (game.waitForTurn)
                playerLabel.fillStyle = `#${game.getCurrentPlayer().color}`;
            else
                playerLabel.fillStyle = `#${game.getCurrentPlayer().color}88`;
            playerLabel.text = game.getCurrentPlayer().name;
        }
        updatePlayerLabel(game);
        game.onChange = updatePlayerLabel;
    }

    function makeSkipButton(game, world) {
        let button = new ui.ButtonWidget(world, new mt.Vect(.5 * game.height - 1.5, -1 * game.width / 2 - 1 - .2), 1.5, .7, "skip", .2);
        button.label.fontSize = .4;
        button.label.font = "Roboto";
        button.label.fontWeight = "lighter";
        button.onClick = btn => {
            let turn = new gm.Turn();
            game.playTurn(turn);
        };
        world.addWidget(button);
    }

    // Main function

    function main() {
        let a = new Player("Alice", "00FFFF");
        let b = new Player("Bob", "FFFF00");
        let players = [a, b];
        let game = new gm.Game(players, 8, 8);

        let sandbox = new ui.Sandbox(document.getElementById("sandbox"));
        makeGrid(game, sandbox.world);
        makePlayerLabel(game, sandbox.world);
        makeSkipButton(game, sandbox.world);

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