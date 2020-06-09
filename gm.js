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
            console.log("currentPlayerIndex", this.currentPlayerIndex);
        }

        gatherPower() {
            for (let row of this.grid) {
                for (let cell of row) {
                    if (cell.owner == this.getCurrentPlayer()) {
                        cell.power += 10;
                    }
                }
            }
        }

        flowPower() {
            for (let row of this.grid) {
                for (let cell of row) {
                    if (cell.owner == this.getCurrentPlayer()) {
                        // TODO
                    }
                }
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