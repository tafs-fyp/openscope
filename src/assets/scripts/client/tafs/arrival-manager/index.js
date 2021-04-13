import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

const AIRPORT_ICAO = "EDDH";

function aircraft_flt_plan_end(aircraft) {
    return _.last(
        _.last(aircraft.fms._routeModel._legCollection)._waypointCollection
    )._name.replace(/[\^@]/gi, "");
}

class STARModel {
    constructor(sim_star, fixes) {
        this.fixes = fixes;
        this.sim_star = sim_star;

        this.flying = [];
        this.traffic = 0;
        this.distance = this.calc_star_distance();
    }

    calc_star_distance() {
        let total = 0,
            path = this.sim_star._body;

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

        sim_writer.send_command(
            `${aircraft.callsign} route ${entry}.${this.sim_star._icao}.${exit}`
        );
        sim_writer.send_command(`${aircraft.callsign} dvs 20`);

        this.traffic += 1;
        this.flying.push([aircraft, entry, exit]);
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
            if (_.defaultTo(this.star_assignments[aircraft.id], false)) return;
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
    }
}
