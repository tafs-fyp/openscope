import _ from "lodash";
import { parse } from "path";
import { distanceToPoint } from "../../math/circle";

const RUNWAY_TIME_DELAY = 90000;
const TAXI_TAKEOFF_DELAY = 10000;

const runways_used = {};
class RankedSID {
    constructor(sid_data, fixes) {
        this.fixes = fixes;
        this.sid_data = sid_data;

        this.traffic_density = 0;
        this.last_used = new Date();

        this.distances = {};
        _.forEach(sid_data._entryPoints, (entry_path, entry_name) => {
            _.forEach(sid_data._exitPoints, (exit_path, exit_name) => {
                const path = [...entry_path, ...sid_data._body, ...exit_path];

                this.distances[
                    [entry_name, exit_name]
                ] = this.calculate_path_distance(path);
            });
        });

        this.queue = [];
        this.departed = [];
    }

    calculate_path_distance(path) {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const first_wp = (Array.isArray(path[i])
                ? path[i][0]
                : path[i]
            ).replace(/[\^@]/gi, "");

            const second_wp = (Array.isArray(path[i + 1])
                ? path[i + 1][0]
                : path[i + 1]
            ).replace(/[\^@]/gi, "");

            total += distanceToPoint(
                this.fixes[first_wp][0],
                this.fixes[first_wp][1],
                this.fixes[second_wp][0],
                this.fixes[second_wp][1]
            );
        }
        return total;
    }

    calculate_rank_and_entry_exit_ways(aircraft) {
        let dest_wp = aircraft.fms._routeModel._legCollection
            .slice(-1)[0]
            ._waypointCollection.slice(-1)[0]._name;
        dest_wp = dest_wp.replace(/[\^@]/gi, "");

        let rank = Infinity;
        let best_entry = "";
        let best_exit = "";

        _.forEach(this.distances, (distance, entexit) => {
            const [entry_name, exit_name] = entexit.split(",");
            const entry_path = this.sid_data._entryPoints[entry_name];
            const exit_path = this.sid_data._exitPoints[exit_name];
            let path = [...entry_path, ...this.sid_data._body, ...exit_path];

            let exit_wp = path.slice(-1)[0];
            exit_wp = Array.isArray(exit_wp) ? exit_wp[0] : exit_wp;
            exit_wp.replace(/[\^@]/gi, "");

            const dest_badness = distanceToPoint(
                this.fixes[dest_wp][0],
                this.fixes[dest_wp][1],
                this.fixes[exit_wp][0],
                this.fixes[exit_wp][1]
            );

            const tmp = this.traffic_density + dest_badness + distance;
            if (tmp < rank) {
                rank = tmp;
                best_entry = entry_name;
                best_exit = exit_name;
            }
        });

        return [rank, best_entry, best_exit];
    }

    add_to_queue(aircraft, entry, exit) {
        this.queue.push([aircraft, entry, exit]);
    }

    depart_plane(sim_writer) {
        const time_delta = Math.abs(new Date() - this.last_used);
        if (time_delta < RUNWAY_TIME_DELAY || !this.queue.length) return;

        const [aircraft, entry, exit] = this.queue.shift();
        const dest_wp = aircraft.fms._routeModel._legCollection
            .slice(-1)[0]
            ._waypointCollection.slice(-1)[0]._name;

        let runway = parseInt(entry.replace("EDDH", ""));
        if (runway > 18) runway -= 18;

        if (
            typeof runways_used[runway] !== "undefined" &&
            Math.abs(new Date() - runways_used[runway]) < RUNWAY_TIME_DELAY
        )
            return;

        sim_writer.send_command(
            `${aircraft.callsign} reroute ${entry}.${this.sid_data._icao}.${exit}..${dest_wp}`
        );
        sim_writer.send_command(
            `${aircraft.callsign} taxi ${entry.replace("EDDH", "")}`
        );
        sim_writer.send_command(`${aircraft.callsign} caf`);

        setTimeout(() => {
            sim_writer.send_command(`${aircraft.callsign} takeoff cvs`);
            this.last_used = new Date();
            runways_used[runway] = new Date();
        }, TAXI_TAKEOFF_DELAY);

        this.last_used = new Date();
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

        this.ranks = {};
    }

    assign_sids() {
        _.forEach(this.sim_reader.get_departure_aircrafts(), (aircraft) => {
            if (typeof this.ranks[aircraft.id] !== "undefined") return;

            this.ranks[aircraft.id] = [];
            _.forEach(this.sids, (sid) => {
                const [
                    rank,
                    entry,
                    exit,
                ] = sid.calculate_rank_and_entry_exit_ways(aircraft);
                this.ranks[aircraft.id].push([rank, entry, exit, sid]);
            });

            const [rank, entry, exit, sid] = _.minBy(
                this.ranks[aircraft.id],
                (o) => o[0]
            );
            sid.add_to_queue(aircraft, entry, exit);
        });
    }

    step() {
        this.assign_sids();
        _.forEach(this.sids, (sid) => {
            sid.depart_plane(this.sim_writer);
        });
    }
}
