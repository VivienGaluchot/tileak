const ui = function () {
    class Widget {
        constructor() {
            this.onClicked = null;
            this.onMouseMoved = null;
        }

        paint(sandbox) { }

        clicked(pos) {
            if (this.onClicked != null) {
                this.onClicked(this);
            }
        }

        mouseMoved(pos) {
            if (this.onMouseMoved != null) {
                this.onMouseMoved(this);
            }
        }
    }

    class LabelWidget extends Widget {
        constructor(pos, text) {
            super();
            this.pos = pos;
            this.text = text;

            this.fillStyle = "#FFF";
            this.font = "Verdana";
            this.textAlign = "left";
            this.fontSize = .5;
        }

        paint(sandbox) {
            sandbox.ctx.save();

            // reverse current transform to draw font in standard pixel size
            var matrix = sandbox.ctx.getTransform();
            var transformedPos = new mt.Vect(
                this.pos.x * matrix.a + this.pos.y * matrix.c + matrix.e,
                this.pos.x * matrix.b + this.pos.y * matrix.d + matrix.f
            );
            sandbox.ctx.resetTransform();

            sandbox.ctx.fillStyle = this.fillStyle;
            sandbox.ctx.font = `${this.fontSize * sandbox.pixelPerUnit * sandbox.dpr}px ${this.font}`;
            sandbox.ctx.textAlign = this.textAlign;
            sandbox.ctx.fillText(this.text, transformedPos.x, transformedPos.y);
            sandbox.ctx.rect(transformedPos.x, transformedPos.y, 5, 5);

            sandbox.ctx.restore();
        }
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
            sandbox.ctx.save();

            sandbox.ctx.lineWidth = .03;
            if (this.hoverred) {
                if (this.onned) {
                    sandbox.ctx.strokeStyle = "#F0F";
                    sandbox.ctx.fillStyle = "#F0F8";
                } else {
                    sandbox.ctx.strokeStyle = "#F0F8";
                    sandbox.ctx.fillStyle = "#F0F4";
                }
            } else {
                sandbox.ctx.strokeStyle = "#FFF8";
                sandbox.ctx.fillStyle = "#FFF";
            }
            sandbox.ctx.beginPath();
            sandbox.ctx.rect(this.x, this.y, this.w, this.h);
            sandbox.ctx.stroke();

            if (this.onned) {
                sandbox.ctx.fillRect(this.x, this.y, this.w, this.h);
            }

            sandbox.ctx.restore();
        }

        clicked(pos) {
            super.clicked(pos);
            if (this.contains(pos)) {
                this.onned = !this.onned;
            }
        }

        mouseMoved(pos) {
            super.mouseMoved(pos);
            this.hoverred = this.contains(pos);
        }
    }

    class WorldWidget extends Widget {
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
            super.clicked(pos);
            for (let child of this.children) {
                child.clicked(pos);
            }
        }

        mouseMoved(pos) {
            super.mouseMoved(pos);
            for (let child of this.children) {
                child.mouseMoved(pos);
            }
        }
    }

    class Sandbox {
        constructor(element, mainWidget) {
            this.canvas = element;
            this.mainWidget = mainWidget;

            this.ctx = this.canvas.getContext("2d");

            this.dpr = 1;
            this.pixelPerUnit = 1;
            this.resized();

            console.debug("setup events");

            window.addEventListener('resize', evt => this.resized(evt));
            element.addEventListener("click", event => this.clicked(event));
            element.addEventListener("mousemove", event => this.mouseMoved(event));
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
            this.dpr = window.devicePixelRatio || 1;

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

        mouseMoved(evt) {
            this.handleRescaledMouseEvent(evt, transformedMouse => this.mainWidget.mouseMoved(transformedMouse));
            this.paint();
        }
    }

    return {
        BoxWidget: BoxWidget,
        LabelWidget: LabelWidget,
        WorldWidget: WorldWidget,
        Sandbox: Sandbox
    }
}();