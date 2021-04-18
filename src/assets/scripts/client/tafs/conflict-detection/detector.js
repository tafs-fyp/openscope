//FYP TODOs
/*
1. Change the radius of conflict detection
2. Made a simple algorithm for resolving conflicts. 

*/

import _ from "lodash";
import { FLIGHT_CATEGORY } from "../../constants/aircraftConstants";

export const CONFLICT_CATEGORIES = {
    SIDSID: 1,
    STARSTAR: 2,
    SIDSTAR: 3,
};

export default class Detector {
    constructor(aircraftController, reader, conflict_resolver) {
        this.aircraftcontroller = aircraftController;
        this.sim_reader = reader;
        this.conflict_resolver = conflict_resolver;
    }

    getConflictsFor(allconflicts, category) {
        const conflicts = _.filter(allconflicts, (conflict) => {
            const [first, second] = conflict.getConflictingAirCrafts();

            const separations = conflict.getSeperations();
            if (separations.horizontal > 6) return false;

            if (category === CONFLICT_CATEGORIES.SIDSID)
                return (
                    first.category === FLIGHT_CATEGORY.DEPARTURE &&
                    second.category === FLIGHT_CATEGORY.DEPARTURE
                );
            else if (category === CONFLICT_CATEGORIES.STARSTAR)
                return (
                    first.category === FLIGHT_CATEGORY.ARRIVAL &&
                    second.category === FLIGHT_CATEGORY.ARRIVAL
                );
            else return first.category !== second.category;
        });

        return _.map(conflicts, (conflict) => {
            const separations = conflict.getSeperations();
            const [first, second] = conflict.getConflictingAirCrafts();
            return {
                first: first.callsign,
                second: second.callsign,
                vertical: separations.vertical,
                horizontal: separations.horizontal,
                nature: category,
            };
        });
    }

    step() {
        let conflicts = this.aircraftcontroller.getConflicts();
        let collidedAirCrafts = this.aircraftcontroller.getCollidedAirCrafts();
        if (collidedAirCrafts.length > 0) {
            console.log("Total Collisions: " + collidedAirCrafts.length);
        }

        if (conflicts.length > 0) {
            let sidconflicts = this.getConflictsFor(
                conflicts,
                CONFLICT_CATEGORIES.SIDSID
            );
            let starconflicts = this.getConflictsFor(
                conflicts,
                CONFLICT_CATEGORIES.STARSTAR
            );
            let sidstarconflicts = this.getConflictsFor(
                conflicts,
                CONFLICT_CATEGORIES.SIDSTAR
            );

            if (sidconflicts.length > 0) {
                //ask sid resolver to resolve
                //this.conflict_resolver.step(sidconflicts,CONFLICT_CATEGORIES.SIDSID);
            }
            if (starconflicts.length > 0) {
                // console.log("STAR conflicts detected: "+sidconflicts.length);
                console.log("STAR CONFLICTS DETECTED");
                this.conflict_resolver.step_starstar(starconflicts);
            }
            if (sidstarconflicts.length > 0) {
            }
        }
    }
}
