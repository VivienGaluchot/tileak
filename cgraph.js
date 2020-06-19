/**
 * Canvas base graph
 */


const cgraph = function () {

    class CanvasWidget {
        constructor(element) {
            this.canvas = element;

            this.ctx = this.canvas.getContext("2d");

            this.resizeHandler = event => this.resized(event);
            window.addEventListener("resize", this.resizeHandler);

            this.sizePollingTimer = null;
            let lastKnownHeight = null;
            let lastKnownWidth = null;
            let self = this;
            function pollSizeChange() {
                let target = self.canvas;
                var rect = target.getBoundingClientRect();
                if (lastKnownHeight == null) {
                    lastKnownWidth = rect.width;
                    lastKnownHeight = rect.height;
                } else if (lastKnownWidth != rect.width || lastKnownHeight != rect.height) {
                    self.resized();
                    lastKnownWidth = rect.width;
                    lastKnownHeight = rect.height;
                }
                self.sizePollingTimer = window.setTimeout(function () { pollSizeChange() }, 100);
            }
            pollSizeChange();
        }

        stop() {
            window.removeEventListener("resize", this.resizeHandler);
            clearTimeout(this.sizePollingTimer);
        }

        resized(evt) {
            this.dpr = window.devicePixelRatio || 1;

            var rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width * this.dpr;
            this.canvas.height = rect.height * this.dpr;

            this.paint();
        }

        getWidth() {
            return this.canvas.width;
        }

        getHeight() {
            return this.canvas.height;
        }

        paint() { }
    }

    class Dataset2D {
        constructor(name, color) {
            this.name = name;
            this.color = color;

            this.points = [];
        }

        addPoint(x, y) {
            this.points.push({ x: x, y: y });
        }
    }

    class CGraph2D extends CanvasWidget {
        constructor(element) {
            super(element);
            this.datasets = [];
            this.resized();
        }

        addDataset(dataset) {
            this.datasets.push(dataset);
        }

        getRanges() {
            let x = 0;
            let y = 0;
            for (let dataset of this.datasets) {
                for (let v of dataset.points) {
                    x = Math.max(x, v.x);
                    y = Math.max(y, v.y);
                }
            }
            return { x: x, y: y };
        }

        paint() {
            let w = this.getWidth();
            let h = this.getHeight();

            this.ctx.save();
            this.ctx.clearRect(0, 0, w, h);

            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = "#FFFFFF";

            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(0, h);
            this.ctx.lineTo(w, h);
            this.ctx.stroke();

            let ranges = this.getRanges();
            function transform(v) {
                let x = w * v.x / ranges.x;
                let y = -1 * h * v.y / ranges.y + h;
                return { x: x, y: y };
            }

            let offset = 0;
            for (let dataset of this.datasets) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = `#${dataset.color}`;
                for (let v of dataset.points) {
                    let t = transform(v);
                    this.ctx.lineTo(t.x, t.y - offset);
                }
                offset++;
                this.ctx.stroke();
            }

            this.ctx.restore();
        }
    }

    return {
        Dataset2D: Dataset2D,
        CGraph2D: CGraph2D
    }
}();