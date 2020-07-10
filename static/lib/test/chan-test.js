/**
 * Concurrent computing test module
 */

"use strict";


const chanTest = function () {

    function structuredTest() {
        // TODO add test
        return {passed: 0, failed: 0};
    }

    function run() {
        console.log("# Chan tests");
        console.log(" ");

        console.log("## structuredTest");
        console.log(" ");
        let structuredTestRes = structuredTest();

        console.log(" ");
        console.log(" ");
        console.log("## Chan Recap");
        console.log(" ");
        console.log("### structuredTest");
        console.log(`failed  ${structuredTestRes.failed} `);
        console.log(`passed  ${structuredTestRes.passed} `);
    }

    return {
        run: run,
    }
}();


document.addEventListener("DOMContentLoaded", (e) => {
    chanTest.run();
});