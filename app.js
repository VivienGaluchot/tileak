function makeGrid(world) {
    let space = .1;
    let halfside = (1 - space) / 2;
    for (let i = -3.5; i < 4; i++) {
        for (let j = -3.5; j < 4; j++) {
            let center = new mt.Vect(i, j);
            world.addWidget(new ui.BoxWidget(center.x - halfside, center.y - halfside, 2 * halfside, 2 * halfside));
        }
    }
}

function main() {
    console.debug("init tileak application");

    let world = new ui.World(false);
    makeGrid(world);

    let sandbox = new ui.Sandbox(document.getElementById("sandbox"), world);
}


document.addEventListener("DOMContentLoaded", (e) => {
    main();
});