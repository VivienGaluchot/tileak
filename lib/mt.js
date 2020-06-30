/**
 * Math utility
 */

"use strict";


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

        add(a) {
            return this.copy().addInplace(a);
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

        scale(a) {
            return this.copy().scaleInplace(a);
        }

        capInplace(a) {
            checkNumber(a);
            var norm = this.norm();
            if (norm > a) {
                this.setNorm(a);
            }
            return this;
        }

        cap(a) {
            return this.copy().capInplace(a);
        }

        rotateInplace(r) {
            let c = Math.cos(r);
            let s = Math.sin(r);
            let x = c * this.x - s * this.y;
            let y = s * this.x + c * this.y;
            this.x = x;
            this.y = y;
            return this;
        }

        rotate(r) {
            return this.copy().rotateInplace(r);
        }
    }

    // from https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Objets_globaux/Math/random
    // return a random int in range [min;max[
    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min)) + min;
    }

    function getRandomByteArray(length) {
        let buffer = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            buffer[i] = getRandomInt(0, 2 ** 8);
        }
        return buffer;
    }

    function bufferToHex(buffer) {
        return [...new Uint8Array(buffer)]
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    return {
        Vect: Vect,
        assertVect: assertVect,
        getRandomInt: getRandomInt,
        getRandomByteArray, getRandomByteArray,
        bufferToHex, bufferToHex
    }
}();