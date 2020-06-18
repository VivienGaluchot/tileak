/**
 * User interface basics
 */


const ui = function () {
    class Widget {
        constructor(father) {
            if (father == null)
                throw Error("father expected");
            this.father = father;
        }

        schedulePaint() {
            this.father.schedulePaint();
        }

        paint(sandbox) { }

        clicked(pos) { }

        mouseMoved(pos) { }
    }

    class LabelWidget extends Widget {
        constructor(father, pos, text, makeText) {
            super(father);
            this.pos = mt.assertVect(pos);
            this.text = text;
            this.makeText = makeText;

            this.fillStyle = "#FFF";
            this.font = "Verdana";
            this.fontSize = .5;
            this.fontWeight = "normal";
            this.textAlign = "left";
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
            sandbox.ctx.font = `${this.fontWeight} ${this.fontSize * sandbox.pixelPerUnit * sandbox.dpr}px ${this.font}`;
            sandbox.ctx.fontWeight
            sandbox.ctx.textAlign = this.textAlign;

            let txt;
            if (this.text != null) {
                txt = this.text;
            } else {
                txt = this.makeText(this);
            }
            sandbox.ctx.fillText(txt, transformedPos.x, transformedPos.y);

            sandbox.ctx.restore();
        }
    }

    class BoxWidget extends Widget {
        constructor(father, pos, w, h) {
            super(father);
            this.pos = mt.assertVect(pos);
            this.w = w;
            this.h = h;
        }

        contains(pos) {
            return this.pos.x <= pos.x
                && (this.pos.x + this.w) >= pos.x
                && this.pos.y <= pos.y
                && (this.pos.y + this.h) >= pos.y;
        }

        paint(sandbox) {
            sandbox.ctx.save();
            sandbox.ctx.beginPath();
            sandbox.ctx.rect(this.pos.x, this.pos.y, this.w, this.h);
            sandbox.ctx.stroke();
            sandbox.ctx.restore();
        }
    }

    class ButtonWidget extends BoxWidget {
        constructor(father, pos, w, h, text, textSpacing) {
            super(father, pos, w, h);
            this.hovered = false;

            this.onClick = null;

            this.baseColor = "FFF";

            this.label = new ui.LabelWidget(this, new mt.Vect(pos.x + w / 2, pos.y + textSpacing), text);
            this.label.fontSize = .3;
            this.label.textAlign = "center";
        }

        paint(sandbox) {
            sandbox.ctx.save();
            sandbox.ctx.beginPath();
            sandbox.ctx.strokeStyle = `#${this.baseColor}8`;
            sandbox.ctx.fillStyle = `#${this.baseColor}4`;

            if (this.hovered) {
                sandbox.ctx.lineWidth = .06;
            } else {
                sandbox.ctx.lineWidth = .03;
            }

            sandbox.ctx.rect(this.pos.x, this.pos.y, this.w, this.h);
            sandbox.ctx.stroke();
            sandbox.ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
            sandbox.ctx.restore();

            this.label.fillStyle = `#${this.baseColor}8`;
            this.label.paint(sandbox);
        }

        clicked(pos) {
            if (this.contains(pos)) {
                if (this.onClick != null) {
                    this.onClick(this);
                    this.schedulePaint();
                }
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

    class NodeWidget extends Widget {
        constructor(father, paintAxis) {
            super(father);
            this.paintAxis = paintAxis;
            this.children = [];
        }

        addWidget(child) {
            if (child.father != this) {
                throw new Error("wrong father");
            }
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

        mouseMoved(pos) {
            for (let child of this.children) {
                child.mouseMoved(pos);
            }
        }
    }

    class Sandbox {
        constructor(element) {
            this.canvas = element;
            this.world = new NodeWidget(this, false);

            this.ctx = this.canvas.getContext("2d");
            this.isPaintScheduled = false;

            this.unitViewed = 15;
            this.dpr = 1;
            this.pixelPerUnit = 1;
            this.resized();

            this.resizeHandler = event => this.resized(event);
            this.clickHandler = event => this.clicked(event);
            this.mousemoveHandler = event => this.mouseMoved(event);
            window.addEventListener('resize', this.resizeHandler);
            this.canvas.addEventListener("click", this.clickHandler);
            this.canvas.addEventListener("mousemove", this.mousemoveHandler);
        }

        stop() {
            window.removeEventListener('resize', this.resizeHandler);
            this.canvas.removeEventListener("click", this.clickHandler);
            this.canvas.removeEventListener("mousemove", this.mousemoveHandler);
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

        schedulePaint() {
            this.isPaintScheduled = true;
        }

        paint() {
            this.isPaintScheduled = false;
            this.ctx.save();
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // default style
            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.strokeStyle = "#FFFFFF";
            this.ctx.lineWidth = 1 / this.pixelPerUnit;
            this.withRescale(sandbox => sandbox.world.paint(sandbox));
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

            this.pixelPerUnit = side / this.unitViewed;

            this.paint();
            console.debug(`sandbox sized to ${this.getWidth()}x${this.getHeight()}px`);
        }

        clicked(evt) {
            this.handleRescaledMouseEvent(evt, transformedMouse => this.world.clicked(transformedMouse));
            if (this.isPaintScheduled) {
                this.paint();
            }
        }

        mouseMoved(evt) {
            this.handleRescaledMouseEvent(evt, transformedMouse => this.world.mouseMoved(transformedMouse));
            if (this.isPaintScheduled) {
                this.paint();
            }
        }
    }

    return {
        BoxWidget: BoxWidget,
        LabelWidget: LabelWidget,
        ButtonWidget: ButtonWidget,
        NodeWidget: NodeWidget,
        Sandbox: Sandbox
    }
}();