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
                console.log(starconflicts);
                this.conflict_resolver.step(
                    starconflicts,
                    CONFLICT_CATEGORIES.STARSTAR
                );
            }
            if (sidstarconflicts.length > 0) {
            }
        }
    }
}

// if(starconflicts.length>0){
//     //ask star resolver to resolve
//     var i = 0;
//     for(i = 0; i < starconflicts.length; i++ )
//     {
//         // console.log(starconflicts[i]);
//         var j = 0;
//         for(j = 0; j < starconflicts.length; j++){
//             let allstarcrafts = this.sim_reader.get_arrival_aircrafts();
//             var k = 0;
//             for(k = 0; k < allstarcrafts.length; k++)
//             {
//                 if(starconflicts[i].first === allstarcrafts[k].getCallsign())
//                 {
//                     console.log("First Current Altitude: "+allstarcrafts[k].altitude);
//                 }
//                 if(starconflicts[i].second === allstarcrafts[k].getCallsign())
//                 {
//                     // console.log(`last waypoint of ${allstarcrafts[k].getCallsign()} === ${_.last(allstarcrafts[k].fms.waypoints) }`);
//                 }

//             }
//         }
//     }
// }
// if(sidstarconflicts.length > 0){
//     //ask sidstar resolver to resolve
// }
