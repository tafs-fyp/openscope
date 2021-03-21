import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

class RankedSID {
    constructor(sid_data, fixes) {
        this.fixes = fixes;
        this.sid_data = sid_data;

        this.last_used = new Date();
        this.traffic_density = 0;
        this.distances = {};
        _.forEach(sid_data._entryPoints, (entry_path, entry_name) => {
            _.forEach(sid_data._exitPoints, (exit_path, exit_name) => {
                const path = [...entry_path, ...sid_data._body, ...exit_path];
                this.distances[
                    [entry_name, exit_name]
                ] = this.calculate_path_distance(path);
            });
        });
    }

    calculate_path_distance(path) {
        let total = 0;
        path = path.filter((waypoint) => waypoint[0] != "#");

        for (let i = 0; i < path.length - 1; i++) {
            const first_wp = Array.isArray(path[i]) ? path[i][0] : path[i];
            const second_wp = Array.isArray(path[i + 1])
                ? path[i + 1][0]
                : path[i + 1];

            total += distanceToPoint(
                this.fixes[first_wp][0],
                this.fixes[first_wp][1],
                this.fixes[second_wp][0],
                this.fixes[second_wp][1]
            );
        }
        return total;
    }
}

export default class DepartureManager {
    constructor(reader, writer) {
        this.sim_reader = reader;
        this.sim_writer = writer;

        this.fixes = _.keyBy(this.sim_reader.get_all_fixes(), "name");
        this.fixes = _.mapValues(this.fixes, (fix) => [
            fix._positionModel.latitude,
            fix._positionModel.longitude,
        ]);

        this.sids = this.sim_reader
            .get_all_sids()
            .map((sid) => new RankedSID(sid, this.fixes));
    }

    step() {}
}
