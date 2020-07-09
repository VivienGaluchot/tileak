/**
 * Concurrent computing
 */

"use strict";


const ccp = function () {

    class MeetingPoint {
        constructor(localId) {
            this.localId = localId;
            /**
             * called when a remote peer joined the sync point
             */
            this.onRemoteWaitingChanged = (remoteId, isWaiting) => { console.warn("unset handler") };

            // concerned peers set
            this.peerSet = new Set();

            // actual joined peers
            this.joinedPeers = new Set();

            this.waitResolve = null;
        }

        // concerned peers

        * remotes() {
            for (let remote of this.peerSet) {
                yield remote;
            }
        }

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
            return new p2p.Frame("meeting-point", { state: "join" });
        }

        onFrame(remoteId, frame) {
            let handler = new p2p.FrameHandler()
                .on("meeting-point", data => {
                    this.joinedPeers.add(remoteId);
                    this.onRemoteWaitingChanged(remoteId, true);

                    if (this.waitResolve != null)
                        this.checkAllJoined();
                });
            handler.handle(frame);
        }

        // internal

        checkAllJoined() {
            var nonJoinedPeers = new Set([...this.peerSet].filter(x => !this.joinedPeers.has(x)));
            if (nonJoinedPeers.size == 0) {
                for (let peer of this.joinedPeers)
                    this.onRemoteWaitingChanged(peer, false);
                this.joinedPeers.clear();
                this.waitResolve();
                this.waitResolve = null;
            }
        }
    }

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

            // callbacks

            /**
             * called when local data is updated
             */
            this.onUpdate = data => { console.warn("unset handler") };

            /**
             * called when a remote peer joined the sync point
             */
            this.onRemoteSyncWaitingChanged = (remoteId, isWaiting) => { console.warn("unset handler") };

            // eventually consistent data

            this.data = null;

            this.voteSrcId = null;
            this.voteData = null;
            this.resetCandidates();

            // sync point

            this.syncPoint = new MeetingPoint();
            this.syncVoteSrcId = null;
            this.syncVoteData = null;
            this.syncVoteClock = null;
            this.resetSyncCandidates();

            this.syncPoint.onRemoteWaitingChanged = (remoteId, isWaiting) => {
                this.onRemoteSyncWaitingChanged(remoteId, isWaiting);
            };
        }

        /**
         * called when a frame must be broadcasted to all the peers
         * @callback BroadcastFrameCallback
         * @param {p2p.Frame} frame is the frame to broadcast
         */

        /**
         * set the local data and share it with the rest of the peers
         * @param {*} data new value to use as state
         * @param {BroadcastFrameCallback} broadcastFrame
         * 
         * in case of conflict - when an other peer change its data at the same time -
         * the local data may change after a vote, one of the two value ill be elected
         * in a consistent way
         */
        setData(data, broadcastFrame) {
            if (this.isWaitingSyncPoint())
                throw new Error("local data must not be updated while waiting sync point");

            this.clock++;
            this.resetCandidates();

            this.data = data;
            this.registerCandidate(this.localId, this.clock, this.data);

            broadcastFrame(this.getStateFrame());

            this.onUpdate?.(this.data);
        }

        /**
         * get local point of view of the data, not guaranteed to be sync now but eventually consistent
         */
        getLocalData() {
            return this.data;
        }

        // sync point

        addSyncPointRemote(id) {
            this.syncPoint.addRemote(id);
        }

        deleteSyncPointRemote(id) {
            this.syncPoint.deleteRemote(id);
        }

        * syncRemotes() {
            for (let remote of this.syncPoint.remotes())
                yield remote;
        }

        /**
         * join and wait a global sync point
         * @param {BroadcastFrameCallback} broadcastFrame
         * return asynchronously a globally consistent data 
         */
        waitSyncPoint(broadcastFrame) {
            let promise = this.syncPoint.wait()
                .then(() => {
                    // syncPoint wait will be resolved after synced data was set in onFrame()
                    return new Promise(resolve => {
                        // vote a consistent data amongst the received
                        let result = {
                            data: this.voteSyncData(),
                            syncRemoteIds: Array.from(this.syncRemotes())
                        }
                        resolve(result);
                        // ready for next sync
                        this.resetSyncCandidates();
                    });
                });
            // register local candidate
            this.registerSyncCandidate(this.localId, this.clock, this.data);
            broadcastFrame(this.getSyncFrame());
            return promise;
        }

        isWaitingSyncPoint() {
            return this.syncPoint.isWaiting();
        }

        // internal eventual consistencies vote

        resetCandidates() {
            this.voteSrcId = null;
            this.voteData = null;
        }

        registerCandidate(id, clock, data) {
            if (clock > this.clock) {
                this.resetCandidates();
            }
            if (this.voteSrcId == null || id < this.voteSrcId) {
                this.voteSrcId = id;
                this.voteData = data;
            }
        }

        vote() {
            return this.voteData;
        }

        // internal sync vote

        resetSyncCandidates() {
            this.syncVoteSrcId = null;
            this.syncVoteData = null;
            this.syncVoteClock = null;
        }

        registerSyncCandidate(id, clock, data) {
            if (this.syncVoteClock == null || this.syncVoteClock < clock) {
                this.resetSyncCandidates();
                this.syncVoteClock = clock;
            }
            if (this.syncVoteSrcId == null || id < this.syncVoteSrcId) {
                this.syncVoteSrcId = id;
                this.syncVoteData = data;
            }
        }

        voteSyncData() {
            return this.syncVoteData;
        }

        // channels

        getSyncFrame() {
            return new p2p.Frame("sync", { clock: this.clock, data: this.getLocalData(), syncPoint: this.syncPoint.frame() });
        }

        getStateFrame() {
            return new p2p.Frame("update", { clock: this.clock, data: this.getLocalData() });
        }

        onFrame(remoteId, frame) {
            let handler = new p2p.FrameHandler()
                .on("update", data => {
                    let remoteClock = data.clock;
                    let remoteData = data.data;

                    let outdated = remoteClock < this.clock;
                    if (!outdated) {
                        // the data must be chosen amongst the conflictedData
                        // in a way that all peers get the same one when updates stops
                        this.registerCandidate(remoteId, remoteClock, data.data);
                        this.data = this.vote()

                        this.clock = Math.max(this.clock, remoteClock);

                        this.onUpdate?.(this.data);
                    } else {
                        console.debug(`SharedState | outdated message dropped`);
                    }
                }).on("sync", data => {
                    this.registerSyncCandidate(remoteId, data.clock, data.data);

                    // trigger the meeting point resolve when all peers send sync
                    this.syncPoint.onFrame(remoteId, data.syncPoint);
                });
            handler.handle(frame);
        }
    }

    return {
        SharedState: SharedState,
        MeetingPoint: MeetingPoint,
    }
}();