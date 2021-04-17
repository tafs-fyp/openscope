import _ from "lodash";
import { distanceToPoint } from "../../math/circle";
import { ConflitCategories } from "../conflict-detection/detector";

const SPEEDINCREMENT = 25; // we will increment the speed by 25 knots.
const ALTITUDEINCREMENT = 1000; // altitude increment factor
const TIMESTAMP = 30; // Time in seconds before taking other action

const Resolutions = {
    Altitude: 1,
    Speed: 2,
    ProceedDirect: 3,
    HoldingPattern: 4,
};

function calc_path_distance(path, fixes) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += distanceToPoint(
            fixes[path[i]][0],
            fixes[path[i]][1],
            fixes[path[i + 1]][0],
            fixes[path[i + 1]][1]
        );
    }
    return total;
}

export default class ConflictResolution {
    constructor(reader, writer, timeFactor) {
        this.sim_reader = reader;
        this.sim_writer = writer;
        this.instructed = new Set(); // Aircrafts that have already been instructed
        this.holdingAirCrafts = {}; // Aircrafs that are in hold
        this.allaircraftsModels = this.sim_reader.get_all_aircrafts();
        this.totalConflictsArisen = 0;
        this.totalSIDConflictsResolved = 0;
        this.totalSTARConflictsResolved = 0;
        this.totalconflictsresolved = 0;
        this.totalCollisions = 0;
        this.resolutionsMade = {};
        this.fixes = _.keyBy(this.sim_reader.get_all_fixes(), "name");
        this.fixes = _.mapValues(this.fixes, (fix) => [
            fix._positionModel.latitude,
            fix._positionModel.longitude,
        ]);

        this.calledAfter = timeFactor;
        this.busyFixes = {};
    }

    // returns a conflict id
    getID(conflict) {
        return (conflict.first + conflict.second).split("").sort().join("");
    }

    getAirCraftModel(callsign) {
        for (let i = 0; i < this.allaircraftsModels.length; i++) {
            if (callsign === this.allaircraftsModels[i].getCallsign()) {
                return this.allaircraftsModels[i];
            }
        }
    }

    getCurrentAltitude(callsign) {
        return this.getAirCraftModel(callsign).altitude;
    }

    getCurrentSpeed(callsign) {
        return this.getAirCraftModel(callsign).speed;
    }

    updateResolutionsMade(conflict) {
        const id = this.getID(conflict);
        this.resolutionsMade[id] = {
            conflict: conflict,
            vertical: conflict.vertical,
            horizontal: conflict.horizontal,
            time: TIMESTAMP,
        };
        this.totalConflictsArisen += 1;
    }

    // return an array of possible resolutions for a given aircraft
    // returns null in case none is possible
    PossibleResolutionsForAirCraftSID(callsign) {
        if (this.instructed.has(callsign)) return null;

        let alValid = true;
        let pdValid = true;
        let spValid = true;

        const model = this.getAirCraftModel(callsign);
        const waypoints = this.getAirCraftModel(callsign).fms.waypoints;

        if (this.getCurrentAltitude(callsign) === model.model.ceiling)
            alValid = false;
        if (this.getCurrentSpeed(callsign) === model.model.speed.max)
            spValid = false;
        if (waypoints.length <= 1) pdValid = false;

        let resolutions = [];
        if (alValid) resolutions.push(Resolutions.Altitude);
        if (spValid) resolutions.push(Resolutions.Speed);
        if (pdValid) resolutions.push(Resolutions.ProceedDirect);
        if (resolutions.length == 0) return null;
        return resolutions;
    }

    // returns the call sign of an aircraft to instruct in sidsid case.
    // returns nullstring if the conflict has already been taken care of
    getCallSignOfAircraftToInstructSID(conflit) {
        const id = this.getID(conflit);
        if (id in this.resolutionsMade) return null;
        // TODO LATER
    }

    // return an array of possible resolutions for a given aircraft
    // returns null in case none is possible
    PossibleResolutionsForAirCraftSTAR(callsign) {
        if (this.instructed.has(callsign)) return null;

        let hpValid = true;
        let spValid = true;

        const model = this.getAirCraftModel(callsign);
        if (
            this.getAirCraftModel(callsign) === undefined ||
            callsign in this.holdingAirCrafts
        )
            return null;

        const waypoints = this.getAirCraftModel(callsign).fms.waypoints;

        if (
            this.getCurrentSpeed(callsign) <
            model.model.speed.min + SPEEDINCREMENT
        )
            spValid = false;
        if (waypoints.length <= 1) hpValid = false;

        let resolutions = [];

        if (spValid) resolutions.push(Resolutions.Speed);
        if (hpValid) resolutions.push(Resolutions.HoldingPattern);

        if (resolutions.length == 0) return null;
        return resolutions;
    }

    getSTARResolution(conflict) {
        const id = this.getID(conflict);
        //if (id in this.resolutionsMade) return null;

        const first_options = this.PossibleResolutionsForAirCraftSTAR(
            conflict.first
        );
        const second_options = this.PossibleResolutionsForAirCraftSTAR(
            conflict.second
        );

        var targetCallsign = null;
        // if no options are available for any aircraft, we opt for the other
        if (first_options === null || second_options === null) {
            if (first_options === null) targetCallsign = conflict.second;
            else targetCallsign = conflict.first;
        } else {
            // obtain the aircraft having max distance

            const aircraft1 = this.getAirCraftModel(conflict.first);
            const aircraft2 = this.getAirCraftModel(conflict.second);
            const first_rem_path = _.map(
                aircraft1.fms.waypoints,
                (waypoint) => waypoint.name
            );
            const second_rem_path = _.map(
                aircraft2.fms.waypoints,
                (waypoint) => waypoint.name
            );

            const first_distance = calc_path_distance(
                first_rem_path,
                this.fixes
            );
            const second_distance = calc_path_distance(
                second_rem_path,
                this.fixes
            );

            targetCallsign =
                first_distance >= second_distance
                    ? conflict.first
                    : conflict.second;
        }
        if (targetCallsign !== null) {
            const options =
                targetCallsign === conflict.first
                    ? first_options
                    : second_options;

            if (options === null) {
                console.log("NO RESOLVE POSSIBLE");
                return null;
            }

            if (options.includes(Resolutions.HoldingPattern)) {
                // instruct holding pattern
                return {
                    callsign: targetCallsign,
                    instruction: Resolutions.HoldingPattern,
                };
            } else if (options.includes(Resolutions.Speed)) {
                return {
                    callsign: targetCallsign,
                    instruction: Resolutions.Speed,
                };
            }
            // currently, we are not doing direct proceeding and altitude chaging
        }
        return null;
    }

    resolveSTARConflict(conflict) {
        const resolution = this.getSTARResolution(conflict);
        if (resolution !== null) {
            if (resolution.instruction === Resolutions.HoldingPattern) {
                const waypoints = this.getAirCraftModel(resolution.callsign).fms
                    .waypoints;
                const lastwp = waypoints[0]._name; // hold on the next way point
                // if the fix is busy we will use altitude adjustment
                if (lastwp in this.busyFixes) {
                    this.sim_writer.send_command(
                        `${resolution.callsign} climb 17`
                    );
                    console.log(
                        `${resolution.callsign} has been instructed to climb FL: 17`
                    );
                } else {
                    const newAltitude = Math.floor(
                        (this.getCurrentAltitude(resolution.callsign) + 1000) /
                            100
                    );
                    this.sim_writer.send_command(
                        `${resolution.callsign} hold ${lastwp} climb ${newAltitude}`
                    );
                    this.holdingAirCrafts[resolution.callsign] = {
                        callsign: resolution.callsign,
                        time: TIMESTAMP,
                        fix: lastwp,
                    };
                    console.log(
                        `${resolution.callsign} has been instructed to hold arround ${lastwp}`
                    );
                    // mark the fix as busy
                    this.busyFixes[lastwp] = this.getCurrentAltitude(
                        resolution.callsign
                    );
                }
            } else if (resolution.instruction === Resolutions.Speed) {
                const decNewSpeed =
                    this.getCurrentSpeed(resolution.callsign) - SPEEDINCREMENT;

                const model = this.getAirCraftModel(resolution.callsign).model;

                if (model.isAbleToMaintainSpeed(decNewSpeed)) {
                    this.sim_writer.send_command(
                        `${resolution.callsign} speed ${decNewSpeed}`
                    );
                    console.log(
                        `${resolution.callsign} new speed == ${decNewSpeed}`
                    );
                } else return;
            }
            this.updateResolutionsMade(conflict);
            this.instructed.add(resolution.callsign);
        }
    }

    updateOldResolutions() {
        // this will be binded in an external callback
        // decrementing timer for all
        for (let key in this.resolutionsMade) {
            this.resolutionsMade[key].time -= this.calledAfter;
        }

        // aircraft should exit hold after timestamp
        for (let key in this.holdingAirCrafts) {
            this.holdingAirCrafts[key].time -= this.calledAfter;
            if (this.holdingAirCrafts[key].time <= 0) {
                var newAltitude = "";
                if (this.getCurrentAltitude(key) > 2000) {
                    newAltitude = " dvs 20";
                }
                this.sim_writer.send_command(
                    // stop holding
                    `${key} exithold ${newAltitude}`
                );
                delete this.busyFixes[this.holdingAirCrafts[key].fix]; // marking the fix free
                delete this.holdingAirCrafts[key];
                console.log(`${key} has been instructed to exit hold`);
            }
        }
    }

    updateConflicts(conflicts) {
        // If the seperation has increased b/w aircrafs, conflict is resolved
        for (const con of conflicts) {
            const id = this.getID(con);
            if (id in this.resolutionsMade) {
                if (this.resolutionsMade[id].time > 0) {
                    continue;
                } else if (
                    this.resolutionsMade[id].time <= 0 &&
                    (this.resolutionsMade[id].vertical > 6 ||
                        this.resolutionsMade[id].horizontal > 6)
                ) {
                    this.totalconflictsresolved += 1;
                    delete this.resolutionsMade[id];
                    if (this.instructed.has(con.first))
                        this.instructed.delete(con.first);
                    else if (this.instructed.has(con.second))
                        this.instructed.delete(con.second);
                } else if (this.resolutionsMade[id].time < 0) {
                    this.resolutionsMade[id].time = TIMESTAMP;
                }
            }
        }
    }
    criticalConflicts(conflicts) {
        for (const con in conflicts) {
            if (con.vertical <= 0.5 && con.horizontal <= 0.5) {
                //critial conflicts
                const aircraft1 = this.getAirCraftModel(con.first);
                const aircraft2 = this.getAirCraftModel(con.second);
                const first_rem_path = _.map(
                    aircraft1.fms.waypoints,
                    (waypoint) => waypoint.name
                );
                const second_rem_path = _.map(
                    aircraft2.fms.waypoints,
                    (waypoint) => waypoint.name
                );

                const first_distance = calc_path_distance(
                    first_rem_path,
                    this.fixes
                );
                const second_distance = calc_path_distance(
                    second_rem_path,
                    this.fixes
                );
                const targetCallsign =
                    first_distance >= second_distance
                        ? conflict.first
                        : conflict.second;
                const newalt = Math.floor(
                    (this.getCurrentAltitude(targetCallsign) + 1000) / 100
                );
                this.sim_writer.send_command(
                    `${targetCallsign} climb ${newalt}`
                );
                console.log(
                    `Resolved a critical conflict for ${targetCallsign}`
                );
            }
        }
    }
    step(conflicts, category) {
        this.updateOldResolutions();
        this.updateConflicts(conflicts);
        this.criticalConflicts(conflicts);
        for (const con of conflicts) {
            const id = this.getID(con);
            if (id in this.resolutionsMade) {
                continue;
            }
            this.resolveSTARConflict(con);
        }
    }

    logAnalytics() {
        const data = {
            totalConflicts: this.totalConflictsArisen,
            totalSTARConfsResolved: this.totalconflictsresolved,
        };
        console.log(data);
    }
}
