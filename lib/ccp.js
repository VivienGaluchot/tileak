/**
 * Concurrent computing
 */

"use strict";


const ccp = function () {

    /**
     * Allows to share a state object between multiple remote peers.
     * 
     * The following consistency properties:
     * - once every transiting frames are received, all peers will have the same data object
     * - in case of concurrency issues the data will be picked according to the peers ids
     * 
     * is guaranteed as long as :
     * - each peer as a different id
     * - each peer keep it's id
     * - peer ids are orderable
     * - the frame() object is broadcasted to all the peers after any setData() call
     * - each broadcast destination pass the frame to onFrame()
     * - no frame are lost
     * - no peer leave without having sent all its frames
     * 
     * TODO
     * - in run catchup system
     * - sync point
     * - acknowledged updates to prevent half-changes
     */
    class SharedState {
        constructor(localId) {
            this.localId = localId;
            this.clock = 0;

            this.onUpdate = data => { };
            this.data = null;

            // vote

            this.votedId = null;
            this.votedData = null;

            // conflict monitoring flag

            this.isConflicted = false;
        }

        setData(data) {
            this.clock++;
            this.resetCandidates();

            this.data = data;
            this.registerCandidate(this.localId, this.data);

            // TODO use ack ?
            this.isConflicted = false;

            this.onUpdate?.(this.data);
        }

        getData() {
            return this.data;
        }

        // vote

        resetCandidates() {
            this.votedId = null;
            this.votedData = null;
        }

        registerCandidate(id, data) {
            if (this.votedId == null || id < this.votedId) {
                this.votedId = id;
                this.votedData = data;
            }
        }

        vote() {
            let voted = this.votedData;
            console.debug(`SharedState ${this.localId} | elected`, voted);
            return voted;
        }

        // channels

        frame() {
            return new p2p.Frame("update", { clock: this.clock, data: this.data });
        }

        onFrame(remoteId, frame) {
            let handler = new p2p.FrameHandler().on("update", data => {
                let remoteClock = data.clock;
                let remoteData = data.data;

                let outdated = remoteClock < this.clock;
                if (!outdated) {
                    // the causality (local state) -> (remote event) is guarantied if
                    // the remote clock is greater thant the local clock
                    let isConflict = remoteClock == this.clock;

                    let nextClock = Math.max(this.clock, remoteClock);
                    // reset the conflictedData on clock change
                    if (nextClock > this.clock) {
                        this.clock = nextClock;
                        this.resetCandidates();
                    }

                    // store the data in conflictedData map
                    this.registerCandidate(remoteId, data.data);

                    if (!isConflict) {
                        // causality guaranteed
                        this.data = remoteData;
                        this.isConflicted = false;
                    } else {
                        // the data must then be chosen amongst the conflictedData
                        // in a way that all peers get the same one when updates stops
                        this.data = this.vote();
                        this.isConflicted = true;
                    }

                    this.onUpdate?.(this.data);
                } else {
                    console.debug(`SharedState ${this.localId} | outdated message dropped`);
                }
            });
            handler.handle(frame);
        }
    }

    return {
        SharedState: SharedState,
    }
}();