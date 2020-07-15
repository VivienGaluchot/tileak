/**
 * This JS module implements the game structures and logics.
 */

"use strict";


const gm = function () {
    class Player {
        constructor(name) {
            this.name = name;

            this.production = 0;
            this.storage = 0;

            this.hasOwnedACell = false;
            this.hasLost = false;
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
                if (neighbor != this.drainTo && neighbor.owner != null) {
                    yield neighbor;
                }
            }
        }

        // own cell for turn

        isPlayable() {
            return this.game.waitForTurn && this.owner == null;
        }
    }

    class Turn {
        constructor(ownedCell, drainSrc, drainDst, surrender) {
            if (ownedCell != null && drainSrc != null)
                throw new Error("single action per turn");

            this.ownedCell = ownedCell;
            this.drainSrc = drainSrc;
            this.drainDst = drainDst;
            this.surrender = surrender;
        }

        serialize() {
            let serializeCell = cell => {
                if (cell != null) {
                    return { i: cell.pos.x, j: cell.pos.y };
                } else {
                    return null;
                }
            };
            return {
                ownedCell: serializeCell(this.ownedCell),
                drainSrc: serializeCell(this.drainSrc),
                drainDst: serializeCell(this.drainDst),
                surrender: this.surrender
            };
        }

        static deserialize(game, data) {
            let deserializeCell = data => {
                if (data != null) {
                    return game.getCell(data.i, data.j);
                } else {
                    return null;
                }
            };
            return new Turn(deserializeCell(data.ownedCell),
                deserializeCell(data.drainSrc),
                deserializeCell(data.drainDst),
                data.surrender
            );
        }
    }

    class SkipTurn extends Turn {
        constructor() {
            super();
        }
    }

    class OwnTurn extends Turn {
        constructor(cell) {
            super(cell);
        }
    }

    class DrainTurn extends Turn {
        constructor(src, dst) {
            super(null, src, dst);
        }
    }

    class UndrainTurn extends Turn {
        constructor(cell) {
            super(null, cell);
        }
    }

    class SurrenderTurn extends Turn {
        constructor() {
            super(null, null, null, true);
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

            this.turnCounter = 0;

            this.currentPlayerIndex = 0;
            this.waitForTurn = true;

            this.terminated = false;
            this.winner = null;

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
            this.onChange?.(this);
        }

        // turn parts

        gatherPower() {
            for (let cell of this.currentPlayerCells()) {
                cell.gatherPower();
            }
            this.signalChange();
        }

        flowPower() {
            // flow power from src to dest, for src being all current player cells
            // the power transferred is 1/2 * power of the src cell

            // if the dest is not owned by the current player:
            // - the power transferred is deduced from the dest power cell
            // - if the dest cell get to a less than 1 of power, it is captured

            let currentPlayer = this.getCurrentPlayer();

            let nextTurnPower = new Map();
            function transferPower(src, dst, amount) {
                if (!nextTurnPower.has(src)) {
                    nextTurnPower.set(src, src.power);
                }
                if (!nextTurnPower.has(dst)) {
                    nextTurnPower.set(dst, dst.power);
                }
                nextTurnPower.set(src, nextTurnPower.get(src) - amount);

                if (dst.owner == currentPlayer) {
                    nextTurnPower.set(dst, nextTurnPower.get(dst) + amount);
                } else {
                    nextTurnPower.set(dst, nextTurnPower.get(dst) - amount);
                }
            }

            for (let cell of this.currentPlayerCells()) {
                if (cell.drainTo != null) {
                    transferPower(cell, cell.drainTo, Math.round(cell.power / 2));
                }
            }

            for (var [cell, power] of nextTurnPower) {
                if (cell.owner == currentPlayer) {
                    if (power < 0)
                        throw new Error("owned cell can't have negative power");
                    cell.power = power;
                } else {
                    if (power < 0) {
                        cell.owner = currentPlayer;
                        cell.power = -1 * power;
                    } else {
                        cell.power = power;
                    }
                }
            }
            this.signalChange();
        }

        updatePlayers() {
            for (let player of this.players) {
                player.production = 0;
                player.storage = 0;
            }
            for (let cell of this.cells()) {
                if (cell.owner != null) {
                    cell.owner.hasOwnedACell = true;
                    cell.owner.production += cell.productionTurn;
                    cell.owner.storage += cell.power;
                }
            }
            for (let player of this.players) {
                if (player.hasOwnedACell && player.production == 0) {
                    player.hasLost = true;
                }
            }
        }

        nextPlayer() {
            // check if the game is terminated
            let nonLostPlayer = 0;
            for (let player of this.players) {
                if (player.hasLost == false) {
                    nonLostPlayer++;
                }
            }
            if (nonLostPlayer <= 1) {
                console.debug(`game terminated`);
                this.terminated = true;
                if (nonLostPlayer == 1) {
                    for (let player of this.players) {
                        if (player.hasLost == false) {
                            this.winner = player;
                        }
                    }
                }
            }

            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            if (this.currentPlayerIndex == 0)
                this.turnCounter++;

            this.signalChange();
        }

        // turn loop

        async playTurn(turn) {
            if (this.terminated)
                throw new Error("game terminated");

            if (!this.waitForTurn) {
                return;
            }
            this.waitForTurn = false;

            function stepDelay() {
                return new Promise(resolve => setTimeout(resolve, 200));
            }

            // step 0
            (() => {
                let player = this.getCurrentPlayer();

                console.debug(`turn step 0 : play turn`);
                assertTurn(turn);
                if (turn.ownedCell != null) {
                    let cell = turn.ownedCell;
                    if (cell.owner != null)
                        throw new Error("cell already owned");
                    cell.owner = player;
                    console.debug(`own cell ${cell.pos.x};${cell.pos.y}`);
                }
                if (turn.drainSrc != null) {
                    let cell = turn.drainSrc;
                    cell.drainTo = turn.drainDst;
                    if (cell.drainTo != null)
                        console.debug(`drain cell ${cell.pos.x};${cell.pos.y} to ${cell.drainTo.pos.x};${cell.drainTo.pos.y}`);
                    else
                        console.debug(`undrain cell ${cell.pos.x};${cell.pos.y}`);
                }
                if (turn.surrender == true) {
                    player.hasLost = true;
                    console.debug(`surrender`);
                }
                this.signalChange();
            })();

            await stepDelay();

            // step 2
            (() => {
                console.debug(`turn step 2 : flow power`);
                this.flowPower();
                this.updatePlayers();
            })();

            await stepDelay();

            // step 3
            (() => {
                console.debug(`turn step 3 : next player`);
                this.nextPlayer();
                console.debug(`player ${this.currentPlayerIndex} '${this.getCurrentPlayer().name}'`);
            })();

            await stepDelay();

            // step 4
            (() => {
                console.debug(`turn step 4 : gather power`);
                this.gatherPower();

                this.waitForTurn = true;
                this.updatePlayers();
                this.signalChange();

                // skip turn for surrenders
                if (!this.terminated && this.getCurrentPlayer().hasLost) {
                    console.debug(`surrender skip turn`);
                    let turn = new gm.Turn();
                    this.playTurn(turn);
                } else {
                    console.debug(`wait for turn`);
                }
            })();
        }
    }

    return {
        Player: Player,
        Turn: Turn,
        SkipTurn: SkipTurn,
        DrainTurn: DrainTurn,
        UndrainTurn: UndrainTurn,
        OwnTurn: OwnTurn,
        SurrenderTurn: SurrenderTurn,
        Game: Game
    }
}();