const mt = function () {
    function checkNumber(a) {
        if (typeof a != "number")
            throw new Error(`${a} is not a number`);
        if (isNaN(a))
            throw new Error(`${a} is not accepted`);
    }

    function assertVect(v) {
        if (!(v instanceof Vect))
            throw new Error(`${v} is not a Vect`);
        return v;
    }

    class Vect {
        constructor(x = 0, y = 0) {
            checkNumber(x);
            checkNumber(y);
            this.x = x;
            this.y = y;
        }

        set(x = 0, y = 0) {
            checkNumber(x);
            checkNumber(y);
            this.x = x;
            this.y = y;
        }

        copy() {
            return new Vect(this.x, this.y);
        }

        norm() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }

        normalizeInplace() {
            var norm = this.norm();
            if (norm == NaN || norm == 0)
                throw Error("math error");
            this.scaleInplace(1 / norm);
            return this;
        }

        setNorm(a) {
            checkNumber(a);
            if (a == NaN)
                throw Error("math error");
            this.normalizeInplace().scaleInplace(a);
            return this;
        }

        addInplace(other) {
            checkNumber(other.x);
            checkNumber(other.y);
            this.x += other.x;
            this.y += other.y;
            return this;
        }

        minus(other) {
            checkNumber(other.x);
            checkNumber(other.y);
            return new Vect(this.x - other.x, this.y - other.y);
        }

        scaleInplace(a) {
            checkNumber(a);
            this.x *= a;
            this.y *= a;
            return this;
        }

        capInplace(a) {
            checkNumber(a);
            var norm = this.norm();
            if (norm > a) {
                this.setNorm(a);
            }
            return this;
        }
    }

    return {
        Vect: Vect,
        assertVect: assertVect
    }
}();