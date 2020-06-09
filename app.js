function makeGrid(world) {
    let width = 8;
    let height = 8;
    let space = .1;
    let halfSide = (1 - space) / 2;

    function makeLabel(x, y, i) {
        let label = new ui.LabelWidget(new mt.Vect(x, y), `${i}`);
        label.fillStyle = "#FFF6";
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
        world.addWidget(makeLabel(-1 * width / 2 - .3, y, j));
    }


    for (let i = 0; i < width; i++) {
        let x = i - width / 2 + .5;
        for (let j = 0; j < height; j++) {
            let y = height / 2 - j - .5;
            let center = new mt.Vect(x, y);
            world.addWidget(new ui.BoxWidget(center.x - halfSide, center.y - halfSide, 2 * halfSide, 2 * halfSide));
        }
    }
}

function main() {
    console.debug("init tileak application");

    let world = new ui.WorldWidget(false);
    makeGrid(world);

    let sandbox = new ui.Sandbox(document.getElementById("sandbox"), world);
}


document.addEventListener("DOMContentLoaded", (e) => {
    main();
});