function makeGrid(world) {
    let width = 8;
    let height = 8;
    let space = .1;
    let halfSide = (1 - space) / 2;

    function makeLabel(x, y, i) {
        let label = new ui.LabelWidget(world, new mt.Vect(x, y), `${i}`);
        label.fillStyle = "#FFF2";
        label.fontSize = .4;
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


    for (let i = 0; i < width; i++) {
        let x = i - width / 2 + .5;
        for (let j = 0; j < height; j++) {
            let y = height / 2 - j - .5;
            let pos = new mt.Vect(x - halfSide, y - halfSide);
            world.addWidget(new ui.BoxWidget(world, pos, 2 * halfSide, 2 * halfSide));
        }
    }
}

function main() {
    console.debug("init tileak application");

    let sandbox = new ui.Sandbox(document.getElementById("sandbox"));
    makeGrid(sandbox.world);
    sandbox.paint();
}


document.addEventListener("DOMContentLoaded", (e) => {
    main();
});