const ui = function () {
    class Widget {
        constructor() { }

        paint(sandbox) { }

        clicked(pos) { }

        mousemoved(pos) { }
    }

    class BoxWidget extends Widget {
        constructor(x, y, w, h) {
            super();
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;

            this.onned = false;
            this.hoverred = false;
        }

        contains(pos) {
            return this.x <= pos.x
                && (this.x + this.w) >= pos.x
                && this.y <= pos.y
                && (this.y + this.h) >= pos.y;
        }

        paint(sandbox) {
            let color = "#FFF";
            if (this.hoverred)
                color = "#FFFA";

            sandbox.ctx.save();
            if (this.onned) {
                sandbox.ctx.fillStyle = color;
                sandbox.ctx.fillRect(this.x, this.y, this.w, this.h);
            } else {
                sandbox.ctx.strokeStyle = color;
                sandbox.ctx.beginPath();
                sandbox.ctx.rect(this.x, this.y, this.w, this.h);
                sandbox.ctx.stroke();
            }
            sandbox.ctx.restore();
        }

        clicked(pos) {
            if (this.contains(pos)) {
                this.onned = !this.onned;
            }
        }

        mousemoved(pos) {
            this.hoverred = this.contains(pos);
        }
    }

    class World extends Widget {
        constructor(paintAxis) {
            super();
            this.paintAxis = paintAxis;
            this.children = [];
        }

        addWidget(child) {
            this.children.push(child);
        }

        paint(sandbox) {
            if (this.paintAxis) {
                sandbox.ctx.save();

                sandbox.ctx.strokeStyle = "red";
                sandbox.ctx.beginPath();
                sandbox.ctx.moveTo(0, 0);
                sandbox.ctx.lineTo(1, 0);
                sandbox.ctx.stroke();

                sandbox.ctx.strokeStyle = "green";
                sandbox.ctx.beginPath();
                sandbox.ctx.moveTo(0, 0);
                sandbox.ctx.lineTo(0, 1);
                sandbox.ctx.stroke();

                sandbox.ctx.restore();
            }

            for (let child of this.children) {
                child.paint(sandbox);
            }
        }

        clicked(pos) {
            for (let child of this.children) {
                child.clicked(pos);
            }
        }

        mousemoved(pos) {
            for (let child of this.children) {
                child.mousemoved(pos);
            }
        }
    }

    class Sandbox {
        constructor(element, mainWidget) {
            this.canvas = element;
            this.mainWidget = mainWidget;

            this.ctx = this.canvas.getContext("2d");

            this.dpr = window.devicePixelRatio || 1;
            this.pixelPerUnit = 1;
            this.resized();

            console.debug("setup events");

            window.addEventListener('resize', evt => this.resized(evt));
            element.addEventListener("click", event => this.clicked(event));
            element.addEventListener("mousemove", event => this.mousemoved(event));
        }

        getWidth() {
            return this.canvas.width;
        }

        getHeight() {
            return this.canvas.height;
        }

        withRescale(lambda) {
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.scale(this.dpr, this.dpr);
            this.ctx.scale(this.pixelPerUnit, -1 * this.pixelPerUnit);
            lambda(this);
            this.ctx.restore();
        }

        paint() {
            this.ctx.save();
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // default style
            this.ctx.fillStyle = "#FFF";
            this.ctx.strokeStyle = "#FFF";
            this.ctx.lineWidth = 1 / this.pixelPerUnit;

            this.withRescale(sandbox => sandbox.mainWidget.paint(sandbox));

            this.ctx.restore();
        }

        // events

        handleRescaledMouseEvent(evt, lambda) {
            var rect = this.canvas.getBoundingClientRect();
            var mouse = new mt.Vect(
                (evt.clientX - rect.left) * this.dpr,
                (evt.clientY - rect.top) * this.dpr);

            this.withRescale(it => {
                var matrix = it.ctx.getTransform();
                var imatrix = matrix.invertSelf();
                var transformedMouse = new mt.Vect(
                    mouse.x * imatrix.a + mouse.y * imatrix.c + imatrix.e,
                    mouse.x * imatrix.b + mouse.y * imatrix.d + imatrix.f
                );
                lambda(transformedMouse);
            });
        }

        resized(evt) {
            var rect = this.canvas.getBoundingClientRect();
            var side = Math.min(rect.width, rect.height);
            this.canvas.width = rect.width * this.dpr;
            this.canvas.height = rect.height * this.dpr;

            this.pixelPerUnit = side / 15;

            this.paint();
            console.debug(`sandbox sized to ${this.getWidth()}x${this.getHeight()}px`);
        }

        clicked(evt) {
            this.handleRescaledMouseEvent(evt, transformedMouse => this.mainWidget.clicked(transformedMouse));
            this.paint();
        }

        mousemoved(evt) {
            this.handleRescaledMouseEvent(evt, transformedMouse => this.mainWidget.mousemoved(transformedMouse));
            this.paint();
        }
    }

    return {
        BoxWidget: BoxWidget,
        World: World,
        Sandbox: Sandbox
    }
}();