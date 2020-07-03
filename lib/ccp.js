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
        }

        setData(data) {
            this.clock++;
            this.resetCandidates();

            this.data = data;
            this.registerCandidate(this.localId, this.data);

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
                    } else {
                        // the data must then be chosen amongst the conflictedData
                        // in a way that all peers get the same one when updates stops
                        this.data = this.vote();
                    }

                    this.onUpdate?.(this.data);
                } else {
                    console.debug(`SharedState ${this.localId} | outdated message dropped`);
                }
            });
            handler.handle(frame);
        }
    }

    class MeetingPoint {
        constructor(localId) {
            this.localId = localId;
            this.peerSet = new Set();

            this.joinedPeers = new Set();

            this.waitResolve = null;
        }

        // concerned peers

        addRemote(id) {
            if (this.peerSet.has(id))
                throw new Error("unexpected state");
            if (id == this.localId)
                throw new Error("unexpected state");
            this.peerSet.add(id);
        }

        deleteRemote(id) {
            if (!this.peerSet.has(id))
                throw new Error("unexpected state");
            this.peerSet.delete(id);

            if (this.waitResolve != null)
                this.checkAllJoined();
        }

        // entry point

        // return a promise resolved when all the concerned peers are waiting on the same meeting point
        wait() {
            return new Promise(resolve => {
                this.waitResolve = resolve;
                this.checkAllJoined();
            });
        }

        isWaiting() {
            return this.waitResolve != null;
        }

        // channels

        frame() {
            return new p2p.Frame("meeting-point", { state: "joined" });
        }

        onFrame(remoteId, frame, writeBack) {
            this.joinedPeers.add(remoteId);

            if (this.waitResolve != null)
                this.checkAllJoined();
        }

        // internal

        checkAllJoined() {
            var nonJoinedPeers = new Set([...this.peerSet].filter(x => !this.joinedPeers.has(x)));
            if (nonJoinedPeers.size == 0) {
                this.joinedPeers.clear();
                this.waitResolve();
                this.waitResolve = null;
            }
        }
    }

    return {
        SharedState: SharedState,
        MeetingPoint: MeetingPoint,
    }
}();