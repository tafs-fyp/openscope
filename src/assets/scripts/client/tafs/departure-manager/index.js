import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

const AIRPORT_ICAO = "EDDH";
const SID_TIME_DELAY = 60000;
const RUNWAY_TIME_DELAY = 90000;
const TAXI_TAKEOFF_DELAY = 15000;

const MAX_AIRPLANES_PER_SID = 20;
const MAX_SID_DISTANCE = 250;
const MAX_SID_DEST_DISTANCE = 250;

const runways_last_used = {};

class ScoredSID {
    constructor(sid_data, fixes) {
        this.fixes = fixes;
        this.sid_data = sid_data;

        this.queue = [];
        this.departed = [];

        this.traffic = 0;
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

    calculate_score_entry_exit(aircraft) {
        const aircraft_dest_wp = aircraft.fms._routeModel._legCollection
            .slice(-1)[0]
            ._waypointCollection.slice(-1)[0]
            ._name.replace(/[\^@]/gi, "");

        let best_score = Infinity;
        let best_entry = "";
        let best_exit = "";

        _.forEach(this.distances, (sid_distance, entexit) => {
            const [entry_name, exit_name] = entexit.split(",");
            const entry_path = this.sid_data._entryPoints[entry_name];
            const exit_path = this.sid_data._exitPoints[exit_name];
            const path = [...entry_path, ...this.sid_data._body, ...exit_path];

            let sid_exit_wp = path.slice(-1)[0];
            sid_exit_wp = Array.isArray(sid_exit_wp)
                ? sid_exit_wp[0]
                : sid_exit_wp;
            sid_exit_wp = sid_exit_wp.replace(/[\^@]/gi, "");

            const sid_dest_distance = distanceToPoint(
                this.fixes[aircraft_dest_wp][0],
                this.fixes[aircraft_dest_wp][1],
                this.fixes[sid_exit_wp][0],
                this.fixes[sid_exit_wp][1]
            );

            const tmp =
                Math.tanh(this.traffic / MAX_AIRPLANES_PER_SID) +
                Math.tanh(sid_dest_distance / MAX_SID_DEST_DISTANCE) +
                Math.tanh(sid_distance / MAX_SID_DISTANCE);

            if (tmp < best_score) {
                best_score = tmp;
                best_entry = entry_name;
                best_exit = exit_name;
            }
        });

        return [best_score, best_entry, best_exit];
    }

    add_to_queue(aircraft, entry, exit) {
        this.queue.push([aircraft, entry, exit]);
    }

    depart_plane(sim_writer) {
        const time_delta = Math.abs(new Date() - this.last_used);
        if (time_delta < SID_TIME_DELAY || !this.queue.length) return;

        const [aircraft, entry, exit] = this.queue.shift();
        const dest_wp = aircraft.fms._routeModel._legCollection
            .slice(-1)[0]
            ._waypointCollection.slice(-1)[0]._name;

        let runway = parseInt(entry.replace(AIRPORT_ICAO, ""));
        if (runway > 18) runway -= 18;

        if (
            typeof runways_last_used[runway] !== "undefined" &&
            Math.abs(new Date() - runways_last_used[runway]) < RUNWAY_TIME_DELAY
        )
            return;

        sim_writer.send_command(
            `${aircraft.callsign} reroute ${entry}.${this.sid_data._icao}.${exit}..${dest_wp}`
        );
        sim_writer.send_command(
            `${aircraft.callsign} taxi ${entry.replace(AIRPORT_ICAO, "")}`
        );
        sim_writer.send_command(`${aircraft.callsign} caf`);

        setTimeout(() => {
            this.last_used = new Date();
            runways_last_used[runway] = new Date();
            sim_writer.send_command(`${aircraft.callsign} takeoff cvs`);
        }, TAXI_TAKEOFF_DELAY);

        this.last_used = new Date();
        runways_last_used[runway] = new Date();
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
            .map((sid) => new ScoredSID(sid, this.fixes));

        this.scores = {};
    }

    assign_sids() {
        _.forEach(this.sim_reader.get_departure_aircrafts(), (aircraft) => {
            if (typeof this.scores[aircraft.id] !== "undefined") return;

            this.scores[aircraft.id] = [];
            _.forEach(this.sids, (sid) => {
                const [score, entry, exit] = sid.calculate_score_entry_exit(
                    aircraft
                );
                this.scores[aircraft.id].push([score, entry, exit, sid]);
            });

            const [score, entry, exit, sid] = _.minBy(
                this.scores[aircraft.id],
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
