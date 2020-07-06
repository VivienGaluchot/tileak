/**
 * Concurrent computing test module
 */

"use strict";


const ccpTest = function () {

    function structuredTest() {
        let failed = 0;
        let passed = 0;

        let aId = "0";
        let bId = "1";
        let cId = "2";
        let a = new ccp.SharedState(aId);
        let b = new ccp.SharedState(bId);
        let c = new ccp.SharedState(cId);

        let valueCtr = 0;
        let setA = () => {
            console.log("set value by A");
            let v = `set A ${valueCtr++}`;
            a.setData({ value: v });
            return v;
        };
        let setB = () => {
            console.log("set value by B");
            let v = `set B ${valueCtr++}`;
            b.setData({ value: v });
            return v;
        };
        let setC = () => {
            console.log("set value by C");
            let v = `set C ${valueCtr++}`;
            c.setData({ value: v });
            return v;
        };

        let aToB = () => { console.log("A -> B"); b.onFrame(aId, a.frame()); };
        let aToC = () => { console.log("A -> C"); c.onFrame(aId, a.frame()); };
        let bToA = () => { console.log("B -> A"); a.onFrame(bId, b.frame()); };
        let bToC = () => { console.log("B -> C"); c.onFrame(bId, b.frame()); };
        let cToA = () => { console.log("C -> A"); a.onFrame(cId, c.frame()); };
        let cToB = () => { console.log("C -> B"); b.onFrame(cId, c.frame()); };

        let checkX = (x, value) => {
            if (x.getLocalData().value != value) {
                console.error("value ko");
                failed++;
            } else {
                console.log("passed");
                passed++;
            }
        };
        let checkA = value => checkX(a, value);
        let checkB = value => checkX(b, value);
        let checkC = value => checkX(c, value);

        let show = () => {
            console.log(`a | ${a.clock}`, a.getLocalData());
            console.log(`b | ${b.clock}`, b.getLocalData());
            console.log(`c | ${c.clock}`, c.getLocalData());
        }

        let expect = "";

        console.log("init");
        show();

        console.log(" ");

        console.log("---");
        console.log("2 peers causality ok");
        console.log("---");

        console.log("set value by A");
        expect = setA();
        show();
        console.log("send A to B, causality is respected");
        aToB();
        show();
        checkA(expect);
        checkB(expect);

        console.log(" ");

        console.log("set value by A");
        expect = setA();
        show();
        console.log("send A to B, causality is respected");
        aToB();
        show();
        checkA(expect);
        checkB(expect);

        console.log(" ");

        console.log("set value by B");
        expect = setB();
        show();
        console.log("send B to A, causality is respected");
        bToA();
        show();
        checkA(expect);
        checkB(expect);

        console.log(" ");

        console.log("---");
        console.log("2 peers causality ko");
        console.log("---");
        expect = setA();
        setB();
        show();
        bToA();
        aToB();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);

        console.log(" ");

        expect = setA();
        setB();
        show();
        aToB();
        bToA();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);

        console.log(" ");

        console.log("---");
        console.log("3 peers causality ok");
        console.log("---");

        expect = setA();
        aToB();
        aToC();
        console.log("causality is respected");
        show();
        checkA(expect);
        checkB(expect);
        checkC(expect);

        console.log("---");
        console.log("3 peers causality ko v1");
        console.log("---");

        expect = setA();
        setB();
        aToB();
        aToC();
        bToA();
        bToC();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);
        checkC(expect);

        console.log("---");
        console.log("3 peers causality ko v2");
        console.log("---");

        expect = setA();
        aToC();
        setB();
        aToB();
        bToA();
        bToC();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);
        checkC(expect);

        console.log("---");
        console.log("3 peers causality ko v3");
        console.log("---");

        expect = setA();
        aToC();
        setB();
        aToB();
        bToA();
        bToC();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);
        checkC(expect);

        console.log("---");
        console.log("3 peers causality ko v4");
        console.log("---");

        expect = setA();
        setB();
        setC();
        aToC();
        aToB();
        bToA();
        bToC();
        cToA();
        cToB();
        console.log("causality not respected, value from A shall be voted");
        show();
        checkA(expect);
        checkB(expect);
        checkC(expect);

        console.log(" ");
        console.log("### Results");
        console.log(" ");
        console.log(`failed  ${failed}`);
        console.log(`passed  ${passed}`);

        return { failed: failed, passed: passed };
    }

    function fuzzyTest(round, shuffleCount) {
        let fuzzyRound = (shuffleCount) => {
            let peerIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
            let peers = Array.from(peerIds).map(id => {
                return {
                    id: id,
                    state: null,
                    set: null,
                    sends: null,
                    frame: null,
                }
            });

            let ctr = 0;
            for (let peer of peers) {
                peer.state = new ccp.SharedState(peer.id);
                peer.set = () => {
                    let v = `${peer.id} ${ctr++} ${peer.id}`;
                    // set value to state
                    peer.state.setData(v);
                    // broadcast frame to other peers
                    peer.frame = peer.state.frame();
                    console.debug(`set ${peer.id} to '${v}'`);
                };
                peer.sends = Array.from(peers).filter(v => v != peer).map(other => {
                    return () => {
                        // frame received by dest with delay
                        let frame = peer.frame;
                        console.debug(`${peer.id} -> ${other.id} `, frame.data);
                        other.state.onFrame(peer.id, frame);
                    };
                });
            }

            let makeOpNode = (peer) => {
                let set = new fuzzy.OpNode();
                set.allOf = [peer.set];

                let broadcast = new fuzzy.OpNode();
                broadcast.allOf = peer.sends;

                set.next = broadcast;
                return set;
            };

            let opNodes = Array.from(peers).map(peer => makeOpNode(peer));
            let executor = new fuzzy.Executor(opNodes);
            executor.shuffle(shuffleCount);
            executor.terminate();

            let values = Array.from(peers).map(peer => peer.state.getLocalData());
            let allOk = true;
            for (let value of values) {
                if (value != values[0]) {
                    allOk = false;
                    break;
                }
            }
            if (!allOk) {
                console.error("inconsistent values");
                console.error("values", values);
                console.error("values", peers);
            } else {
                console.log("OK");
            }
            return allOk;
        };

        let failed = 0;
        let passed = 0;

        for (let i = 0; i < round; i++) {
            console.log(" ");
            console.log(`### Round ${i} `);
            let ok = fuzzyRound(shuffleCount);
            if (!ok)
                failed++;
            else
                passed++;
        }

        console.log(" ");
        console.log("### Results");
        console.log(" ");
        console.log(`failed  ${failed} `);
        console.log(`passed  ${passed} `);

        return { failed: failed, passed: passed };
    }

    function run() {
        console.log("# CCP tests");
        console.log(" ");

        console.log("## structuredTest");
        console.log(" ");
        let structuredTestRes = structuredTest();

        console.log("## fuzzyTest");
        console.log(" ");
        let fuzzyTestRes = fuzzyTest(100, 50);

        console.log(" ");
        console.log(" ");
        console.log("## CCP Recap");
        console.log(" ");
        console.log("### structuredTest");
        console.log(`failed  ${structuredTestRes.failed} `);
        console.log(`passed  ${structuredTestRes.passed} `);
        console.log(" ");
        console.log("### fuzzyTest");
        console.log(`failed  ${fuzzyTestRes.failed} `);
        console.log(`passed  ${fuzzyTestRes.passed} `);
    }

    return {
        run: run,
    }
}();


document.addEventListener("DOMContentLoaded", (e) => {
    ccpTest.run();
});