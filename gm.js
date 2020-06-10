const gm = function () {
    class Player {
        constructor(name) {
            this.name = name;
        }
    }

    class Cell {
        constructor(game, pos) {
            this.game = game;
            this.pos = mt.assertVect(pos);
            this.owner = null;

            this.widget = null;

            this.power = 0;
            this.productionTurn = 10;

            this.drainTo = null;
        }

        * neighbors() {
            if (this.pos.x > 0)
                yield this.game.getCell(this.pos.x - 1, this.pos.y);
            if (this.pos.x < this.game.width - 1)
                yield this.game.getCell(this.pos.x + 1, this.pos.y);
            if (this.pos.y > 0)
                yield this.game.getCell(this.pos.x, this.pos.y - 1);
            if (this.pos.y < this.game.height - 1)
                yield this.game.getCell(this.pos.x, this.pos.y + 1);
        }

        gatherPower() {
            this.power += this.productionTurn;
        }

        // drain cell for turn

        isDrainable() {
            return this.game.waitForTurn && this.owner == this.game.getCurrentPlayer();
        }

        * drainDsts() {
            for (let neighbor of this.neighbors()) {
                if (neighbor != this.drainTo && neighbor.owner == this.owner) {
                    yield neighbor;
                }
            }
        }

        selectForDrain() {
            this.game.selectedCell = this;
        }

        drainForTurn(dst) {
            let turn = new Turn(null, this, dst);
            this.game.playTurn(turn);
        }

        // own cell for turn

        isPlayable() {
            return this.game.waitForTurn && this.owner == null;
        }

        playForTurn() {
            let turn = new Turn(this, null, null);
            this.game.playTurn(turn);
        }
    }

    class Turn {
        constructor(ownedCell, drainSrc, drainDst) {
            if (ownedCell != null && drainSrc != null)
                throw new Error("single action per turn");

            this.ownedCell = ownedCell;
            this.drainSrc = drainSrc;
            this.drainDst = drainDst;
        }
    }

    function assertTurn(v) {
        if (!v instanceof Turn)
            throw new Error("not a Turn");
        return v;
    }

    class Game {
        constructor(players, width, height) {
            this.players = players;
            this.width = width;
            this.height = height;

            this.grid = [];
            for (let i = 0; i < width; i++) {
                let row = [];
                for (let j = 0; j < height; j++) {
                    row.push(new Cell(this, new mt.Vect(i, j)));
                }
                this.grid.push(row);
            }

            this.currentPlayerIndex = 0;
            this.waitForTurn = true;

            this.selectedCell = null;

            this.onChange = null;
        }

        * cells() {
            for (let row of this.grid) {
                for (let cell of row) {
                    yield cell;
                }
            }
        }

        * currentPlayerCells() {
            let current = this.getCurrentPlayer();
            for (let cell of this.cells()) {
                if (cell.owner == current) {
                    yield cell;
                }
            }
        }

        maxPower() {
            let max = 0;
            for (let cell of this.cells()) {
                if (cell.power > max) {
                    max = cell.power;
                }
            }
            return max;
        }

        getCell(i, j) {
            if (i < 0 || i >= this.width)
                throw new Error("row out of range");
            if (j < 0 || j >= this.height)
                throw new Error("col out of range");
            return this.grid[i][j];
        }

        getCurrentPlayer() {
            return this.players[this.currentPlayerIndex];
        }

        // signal

        signalChange() {
            if (this.onChange != null) {
                this.onChange(this);
            }
        }

        // turn parts

        nextPlayer() {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            this.signalChange();
        }

        gatherPower() {
            for (let cell of this.currentPlayerCells()) {
                cell.gatherPower();
            }
            this.signalChange();
        }

        flowPower() {
            let nextTurnPower = new Map();
            function transferPower(src, dst, incr) {
                if (!nextTurnPower.has(src)) {
                    nextTurnPower.set(src, src.power);
                }
                if (!nextTurnPower.has(dst)) {
                    nextTurnPower.set(dst, dst.power);
                }
                nextTurnPower.set(src, nextTurnPower.get(src) - incr);
                nextTurnPower.set(dst, nextTurnPower.get(dst) + incr);
            }

            for (let cell of this.currentPlayerCells()) {
                if (cell.drainTo != null) {
                    transferPower(cell, cell.drainTo, Math.round(cell.power / 2));
                }
            }

            for (var [cell, power] of nextTurnPower) {
                if (power < 0)
                    throw new Error("can't create negative power");
                cell.power = power;
            }
            this.signalChange();
        }

        // turn loop

        playTurn(turn) {
            if (!this.waitForTurn) {
                return;
            }
            this.waitForTurn = false;
            this.selectedCell = null;

            let self = this;

            function step3() {
                self.waitForTurn = true;
                self.nextPlayer();
            }

            function step2() {
                self.flowPower();
                setTimeout(step3, 100);
            }

            function step1() {
                self.gatherPower();
                setTimeout(step2, 100);
            }

            function step0() {
                assertTurn(turn);
                if (turn.ownedCell != null) {
                    let cell = turn.ownedCell;
                    if (cell.owner != null)
                        throw new Error("cell already owned");
                    cell.owner = self.getCurrentPlayer();
                }
                if (turn.drainSrc != null) {
                    let cell = turn.drainSrc;
                    cell.drainTo = turn.drainDst;
                }
                self.signalChange();

                setTimeout(step1, 100);
            }

            step0();
        }


    }

    return {
        Player: Player,
        Turn: Turn,
        Game: Game
    }
}();