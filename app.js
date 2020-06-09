class CellWidget extends ui.BoxWidget {
    constructor(father, game, cell) {
        let spacing = .1;
        let halfSide = (1 - spacing) / 2;
        let x = cell.pos.y - game.height / 2 + .5;
        let y = game.width / 2 - cell.pos.x - .5;
        let pos = new mt.Vect(x - halfSide, y - halfSide);

        super(father, pos, 1 - spacing, 1 - spacing);

        this.game = game;
        this.cell = cell;

        this.hovered = false;

        this.powerLabel = new ui.LabelWidget(this, new mt.Vect(pos.x + halfSide, pos.y + .35), null, lbl => `${cell.power}`);
        this.powerLabel.fillStyle = "#FFF8";
        this.powerLabel.fontSize = .3;
        this.powerLabel.textAlign = "center";
    }

    getPowerOpacity() {
        let maxPower = this.game.maxPower();
        let opacity = this.cell.power / maxPower;
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

        if (this.hovered || this.cell.owner != null) {
            sandbox.ctx.strokeStyle = `#${baseColor}`;
            sandbox.ctx.fillStyle = `#${baseColor}${this.getPowerOpacity()}`;
        } else {
            sandbox.ctx.strokeStyle = `#${baseColor}88`;
            sandbox.ctx.fillStyle = `#${baseColor}44`;
        }

        if (this.hovered && this.cell.isPlayable()) {
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

        sandbox.ctx.restore();

        if (this.cell.owner != null)
            this.powerLabel.paint(sandbox);
    }

    clicked(pos) {
        if (this.contains(pos) && this.cell.isPlayable()) {
            this.cell.playForTurn();
            this.schedulePaint();
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

class Player extends gm.Player {
    constructor(name, color) {
        super(name);
        this.color = color;
    }
}

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

function main() {
    let a = new Player("A", "00FFFF");
    let b = new Player("B", "FFFF00");
    let players = [a, b];
    let game = new gm.Game(players, 8, 8);

    let sandbox = new ui.Sandbox(document.getElementById("sandbox"));
    makeGrid(game, sandbox.world);
    makePlayerLabel(game, sandbox.world);
    makeSkipButton(game, sandbox.world);

    sandbox.paint();
}

window.addEventListener("error", function (e) {
    document.getElementById("masked_error").style.display = "block";
    return false;
});

document.addEventListener("DOMContentLoaded", (e) => {
    main();
});