import _ from "lodash";
import { FLIGHT_CATEGORY } from "../../constants/aircraftConstants";

const SEPARATION_HTHRESHOLD = 6;
const SEPARATION_VTHRESHOLD = 1000;

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
            if (
                separations.horizontal > SEPARATION_HTHRESHOLD ||
                separations.vertical > SEPARATION_VTHRESHOLD
            )
                return false;

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
        if (conflicts.length > 0) {
            let starconflicts = this.getConflictsFor(
                conflicts,
                CONFLICT_CATEGORIES.STARSTAR
            );

            if (starconflicts.length > 0) {
                this.conflict_resolver.step_starstar(starconflicts);
            }
        }
    }
}
