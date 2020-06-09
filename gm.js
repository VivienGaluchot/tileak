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
            this.power = 0;
            this.productionTurn = 10;
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
            if (this.productionTurn > 0) {
                this.power += this.productionTurn;
                this.productionTurn--;
            }
        }

        isPlayable() {
            return this.owner == null;
        }

        playForTurn() {
            let turn = new Turn(this.pos);
            this.game.playTurn(turn);
        }
    }

    class Turn {
        constructor(ownedPos) {
            if (ownedPos != null)
                this.ownedPos = mt.assertVect(ownedPos);
            else
                this.ownedPos = null;
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

        // turn parts

        nextPlayer() {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }

        gatherPower() {
            for (let cell of this.currentPlayerCells()) {
                cell.gatherPower();
            }
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
                let totalPwrDiff = 0;
                for (let neighbor of cell.neighbors()) {
                    if (neighbor.owner == this.getCurrentPlayer()) {
                        if (cell.power > neighbor.power) {
                            totalPwrDiff += cell.power - neighbor.power;
                        }
                    }
                }

                let pwrOutput = Math.min(cell.power, totalPwrDiff);
                for (let neighbor of cell.neighbors()) {
                    if (neighbor.owner == this.getCurrentPlayer()) {
                        if (cell.power > neighbor.power) {
                            let localDiff = cell.power - neighbor.power;
                            let localRatio = localDiff / totalPwrDiff;
                            let localOutput = Math.floor(localRatio * pwrOutput / 2);
                            console.log(cell.pos, neighbor.pos, localOutput);
                            transferPower(cell, neighbor, localOutput);
                        }
                    }
                }
            }

            for (var [cell, power] of nextTurnPower) {
                if (power < 0)
                    throw new Error("can't create negative power");
                cell.power = power;
            }
        }

        // turn loop

        playTurn(turn) {
            assertTurn(turn);
            if (turn.ownedPos != null) {
                let cell = this.getCell(turn.ownedPos.x, turn.ownedPos.y);
                if (cell.owner != null)
                    throw new Error("cell already owned");
                cell.owner = this.getCurrentPlayer();
            }

            this.gatherPower();
            this.flowPower();

            this.nextPlayer();
            if (this.onChange != null) {
                this.onChange(this);
            }
        }
    }

    return {
        Player: Player,
        Turn: Turn,
        Game: Game
    }
}();