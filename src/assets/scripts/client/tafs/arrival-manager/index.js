import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

const AIRPORT_ICAO = "EDDH";
const ASSIGNED_ALT = 2000;
const ASSIGNED_SPD = 240;

function aircraft_flt_plan_end(aircraft) {
    return _.last(aircraft.fms.waypoints)._name.replace(/[\^@]/gi, "");
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

class STARModel {
    constructor(sim_star, fixes) {
        this.fixes = fixes;
        this.sim_star = sim_star;

        this.flying = [];
        this.total_arrivals = 0;

        this.traffic = 0;
        this.distance = this.calc_star_distance();
    }

    calc_star_distance() {
        const path = _.map(this.sim_star._body, (waypoint) =>
            (Array.isArray(waypoint) ? waypoint[0] : waypoint).replace(
                /[\^@]/gi,
                ""
            )
        );
        return calc_path_distance(path, this.fixes);
    }

    get_supported_runways() {
        return _.map(_.keys(this.sim_star._exitPoints), (exit_name) =>
            exit_name.replace(AIRPORT_ICAO, "")
        );
    }

    supports_one_of_runways(runways) {
        return (
            _.intersection(this.get_supported_runways(), runways).length != 0
        );
    }

    supports_entry_at(waypoint) {
        return _.indexOf(_.keys(this.sim_star._entryPoints), waypoint) != -1;
    }

    fly_star(aircraft, arrival_runways, sim_writer) {
        const entry = aircraft_flt_plan_end(aircraft);
        const exit = `${AIRPORT_ICAO}${_.sample(arrival_runways)}`;

        console.log(
            `[ARRIVAL MANAGER] ${aircraft.callsign} HAS BEEN ASSIGNED STAR: ${entry}.${this.sim_star._icao}.${exit}`
        );

        sim_writer.send_command(
            `${aircraft.callsign} route ${entry}.${this.sim_star._icao}.${exit}`
        );

        sim_writer.send_command(
            `${aircraft.callsign} dvs ${ASSIGNED_ALT / 100} speed ${ASSIGNED_SPD}`
        );

        this.traffic += 1;
        this.flying.push([aircraft, entry, exit]);
    }

    clear_ils(sim_writer) {
        _.remove(this.flying, ([aircraft, _entry, exit]) => {
            if (aircraft.fms.waypoints.length > 1) return false;

            console.log(
                `[ARRIVAL MANAGER] ${
                    aircraft.callsign
                } HAS BEEN CLEARED FOR ILS ON ${exit.replace(AIRPORT_ICAO, "")}`
            );

            sim_writer.send_command(
                `${aircraft.callsign} ils ${exit.replace(AIRPORT_ICAO, "")}`
            );

            this.total_arrivals += 1;
            this.traffic -= 1;
            return true;
        });
    }
}

export default class ArrivalManager {
    constructor(sim_reader, sim_writer, arrival_runways) {
        this.sim_reader = sim_reader;
        this.sim_writer = sim_writer;
        this.arrival_runways = arrival_runways;

        this.fixes = _.keyBy(this.sim_reader.get_all_fixes(), "name");
        this.fixes = _.mapValues(this.fixes, (fix) => [
            fix._positionModel.latitude,
            fix._positionModel.longitude,
        ]);

        this.stars = this.sim_reader
            .get_all_stars()
            .map((sim_star) => new STARModel(sim_star, this.fixes));

        this.available_stars = _.filter(this.stars, (star) =>
            star.supports_one_of_runways(this.arrival_runways)
        );

        this.star_assignments = {};
    }

    assign_stars() {
        for (const aircraft of this.sim_reader.get_arrival_aircrafts()) {
            if (_.defaultTo(this.star_assignments[aircraft.id], false))
                continue;

            const flight_plan_end = aircraft_flt_plan_end(aircraft);
            const valid_stars = _.filter(this.available_stars, (star) =>
                star.supports_entry_at(flight_plan_end)
            );
            valid_stars = _.sortBy(valid_stars, (star) => star.traffic).slice(
                0,
                3
            );
            valid_stars = _.sortBy(valid_stars, (star) => star.distance);

            valid_stars[0].fly_star(
                aircraft,
                this.arrival_runways,
                this.sim_writer
            );
            this.star_assignments[aircraft.id] = valid_stars[0];
        }
    }

    step() {
        this.assign_stars();
        let successful_arrivals = 0;
        for (const star of this.available_stars) {
            star.clear_ils(this.sim_writer);
            successful_arrivals += star.total_arrivals;
        }

        console.log(
            `[ARRIVAL MANAGER] ${successful_arrivals} ARRIVALS HAVE LANDED`
        );
    }
}
