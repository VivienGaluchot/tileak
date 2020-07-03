/**
 * Fuzzy testing
 */

"use strict";


const fuzzy = function () {

    function* randomize(array) {
        let choice = Array.from(array);
        while (choice.length > 0) {
            let index = mt.getRandomInt(0, choice.length);
            let op = choice[index];
            choice.splice(index, 1);
            yield op;
        };
    }

    // Define a decentralized operation, and its potential successors
    class OpNode {
        constructor() {
            // all this op must be executed in any order before going to next operational state
            this.allOf = [];

            // next node
            this.next = null;

            // internal
            this.gen;
        }

        // return false if terminated
        exec(terminate = false) {
            if (this.gen == null) {
                this.gen = this.nextOp();
            }

            let it = this.gen.next();
            if (terminate && it.done) {
                this.gen = null;
                return false;
            }

            if (it.done) {
                this.gen = this.nextOp();
                it = this.gen.next();
            }
            let op = it.value;
            op();
            return true;
        }

        * nextOp() {
            for (let op of randomize(this.allOf)) {
                yield op;
            }
            if (this.next) {
                for (let op of this.next.nextOp()) {
                    yield op;
                }
            }
        }
    }

    // Call operations on multiple decentralized nodes
    class Executor {
        constructor(nodes) {
            this.nodes = nodes;
        }

        // exec are called randomly on all the nodes a total number of time shuffleCount
        // when nodes are on a terminal state they resets
        shuffle(shuffleCount) {
            for (let i = 0; i < shuffleCount; i++) {
                let index = mt.getRandomInt(0, this.nodes.length);
                let node = this.nodes[index];
                node.exec();
            }
        }

        // exec are called randomly on all the nodes until they all are on a terminal state
        terminate() {
            let unterminated = Array.from(this.nodes);
            while (unterminated.length > 0) {
                let index = mt.getRandomInt(0, unterminated.length);
                let node = unterminated[index];
                let executed = node.exec(true);
                if (!executed) {
                    unterminated.splice(index, 1);
                }
            }
        }
    }

    return {
        OpNode: OpNode,
        Executor: Executor,
    }
}();