import _ from "lodash";
import { distanceToPoint } from "../../math/circle";
import { FLIGHT_PHASE } from "../../constants/aircraftConstants";

const AIRPORT_ICAO = "EDDH";
const SID_TIME_DELAY = 180000;
const RUNWAY_TIME_DELAY = 180000;
const TAXI_TAKEOFF_DELAY = 60000;

const DEPARTURE_ALT_MIN = 80;
const DEPARTURE_ALT_MAX = 100;
const DEPARTURE_ALT_STEP = 10;

const runways_locked = {};
let timewarp_value = 1;

function aircraft_flt_plan_start(aircraft) {
    return aircraft.fms.waypoints[0]._name.replace(/[\^@]/gi, "");
}

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

class SIDModel {
    constructor(sim_sid, fixes) {
        this.fixes = fixes;
        this.sim_sid = sim_sid;

        this.queue = [];
        this.total_departures = 0;

        this.traffic = 0;
        this.last_used = null;
        this.distance = this.calc_sid_distance();
    }

    calc_sid_distance() {
        const path = _.map(this.sim_sid._body, (waypoint) =>
            (Array.isArray(waypoint) ? waypoint[0] : waypoint).replace(
                /[\^@]/gi,
                ""
            )
        );
        return calc_path_distance(path, this.fixes);
    }

    get_supported_runways() {
        return _.map(_.keys(this.sim_sid._entryPoints), (entry_name) =>
            entry_name.replace(AIRPORT_ICAO, "")
        );
    }

    supports_one_of_runways(runways) {
        return (
            _.intersection(this.get_supported_runways(), runways).length != 0
        );
    }

    supports_exit_at(waypoint) {
        return _.indexOf(_.keys(this.sim_sid._exitPoints), waypoint) != -1;
    }

    add_to_queue(aircraft, departure_runways) {
        const chosen_runway = _.sample(departure_runways);
        const entry_name = `${AIRPORT_ICAO}${chosen_runway}`;
        const exit_name = aircraft_flt_plan_start(aircraft);
        this.queue.push([aircraft, entry_name, exit_name]);
        this.traffic += 1;
    }

    depart_from_queue(sim_writer) {
        if (this.queue.length == 0) return;
        if (
            this.last_used !== null &&
            Math.abs(new Date() - this.last_used) <
                SID_TIME_DELAY / timewarp_value
        )
            return;

        const [aircraft, entry, exit] = this.queue[0];
        const runway = entry.replace(AIRPORT_ICAO, "");

        if (
            _.defaultTo(runways_locked[runway], false) &&
            Math.abs(new Date() - runways_locked[runway]) <
                RUNWAY_TIME_DELAY / timewarp_value
        )
            return;

        this.queue.shift();

        console.log(
            `[DEPARTURE MANAGER] ${aircraft.callsign} HAS BEEN ASSIGNED SID: ${entry}.${this.sim_sid._icao}.${exit}`
        );

        sim_writer.send_command(
            `${aircraft.callsign} sid ${entry}.${this.sim_sid._icao}.${exit}`
        );

        sim_writer.send_command(`${aircraft.callsign} taxi ${runway}`);

        const taxi_plane = () => {
            if (aircraft.flightPhase === FLIGHT_PHASE.TAXI) {
                setTimeout(taxi_plane, 60000 / timewarp_value);
                return;
            }

            sim_writer.send_command(
                `${aircraft.callsign} takeoff cvs ${
                    _.random(
                        DEPARTURE_ALT_MIN / DEPARTURE_ALT_STEP,
                        DEPARTURE_ALT_MAX / DEPARTURE_ALT_STEP
                    ) * DEPARTURE_ALT_STEP
                }`
            );

            this.total_departures += 1;
            runways_locked[runway] = new Date();
            this.last_used = new Date();
        };

        setTimeout(taxi_plane, TAXI_TAKEOFF_DELAY / timewarp_value);
        runways_locked[runway] = new Date();
        this.last_used = new Date();
    }
}

export default class DepartureManager {
    constructor(sim_reader, sim_writer, departure_runways) {
        this.sim_reader = sim_reader;
        this.sim_writer = sim_writer;
        this.departure_runways = departure_runways;

        this.fixes = _.keyBy(this.sim_reader.get_all_fixes(), "name");
        this.fixes = _.mapValues(this.fixes, (fix) => [
            fix._positionModel.latitude,
            fix._positionModel.longitude,
        ]);

        this.sids = this.sim_reader
            .get_all_sids()
            .map((sim_sid) => new SIDModel(sim_sid, this.fixes));

        this.available_sids = _.filter(this.sids, (sid) =>
            sid.supports_one_of_runways(this.departure_runways)
        );

        this.sid_assignments = {};
    }

    assign_sids() {
        for (const aircraft of this.sim_reader.get_departure_aircrafts()) {
            if (_.defaultTo(this.sid_assignments[aircraft.id], false)) continue;
            const flight_plan_start = aircraft_flt_plan_start(aircraft);

            const valid_sids = _.filter(this.available_sids, (sid) =>
                sid.supports_exit_at(flight_plan_start)
            );
            valid_sids = _.sortBy(valid_sids, (sid) => sid.traffic).slice(0, 3);
            valid_sids = _.sortBy(valid_sids, (sid) => sid.distance);

            valid_sids[0].add_to_queue(aircraft, this.departure_runways);
            this.sid_assignments[aircraft.id] = valid_sids[0];
        }
    }

    step() {
        this.assign_sids();
        let successful_departures = 0;
        for (const sid of this.available_sids) {
            sid.depart_from_queue(this.sim_writer);
            successful_departures += sid.total_departures;
        }

        console.log(
            `[DEPARTURE MANAGER] ${successful_departures} DEPARTURES HAVE TAKEN OFF`
        );
    }

    update_timewarp_value(value) {
        timewarp_value = value;
    }
}
