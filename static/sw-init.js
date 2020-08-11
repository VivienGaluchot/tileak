/**
 * This JS module is the main module.
 * It provides a user interface to the game.
 */

"use strict";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
        if (reg.installing) {
            console.log('Service worker installing');
        } else if (reg.waiting) {
            console.log('Service worker installed');
        } else if (reg.active) {
            console.log('Service worker active');
        }
    }).catch(function (error) {
        console.warn('Service worker registration failed with ' + error);
    });
} else {
    console.warn('Service worker not available');
}