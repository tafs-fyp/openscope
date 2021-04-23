import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

const SPEED_CHANGE = 25;
const ALTITUTDE_CHANGE = 1000;

const ARRIVAL_ASSIGNED_ALT = 2000;
const HOLDING_UNAVAILABLE_ALT = 1700;

const MIN_WPS_FOR_HOLDING = 3;
const MIN_DIST_TO_RESOLVE = 2;
const MIN_TIME_TO_RESOLVE = 60;

const LOSS_OF_SEPARATION_DIST = 2;
const LOSS_OF_SEPARATION_ALT = 500;

const RESOLUTION_TIME = 20;
const TIME_DECREMENT_STEP = 5;

const RESOLUTIONS = {
    SPEED: 1,
    ALTITUDE: 2,
    PROCEED_DIRECT: 3,
    HOLDING_PATTERN: 4,
};

let timewarp_value = 0;

function calc_remaining_distance(aircraft, fixes) {
    return calc_path_distance(
        _.map(aircraft.fms.waypoints, (waypoint) => waypoint.name),
        fixes
    );
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

function deg_to_rad(deg) {
    return deg * (Math.PI / 180);
}

function rad_to_deg(rad) {
    return rad * (180 / Math.PI);
}

export default class ConflictResolution {
    constructor(reader, writer) {
        this.sim_reader = reader;
        this.sim_writer = writer;
        this.fixes = _.keyBy(this.sim_reader.get_all_fixes(), "name");
        this.fixes = _.mapValues(this.fixes, (fix) => [
            fix._positionModel.latitude,
            fix._positionModel.longitude,
        ]);

        this.resolutions = {};
        this.resolved_conflicts = 0;
        this.attempted_resolutions = 0;

        this.loss_of_separations = 0;
        this.los_already_recorded = {};
    }

    get_conflict_id(conflict) {
        if (conflict.first.localeCompare(conflict.second) === -1)
            return conflict.first + conflict.second;
        return conflict.second + conflict.first;
    }

    already_instructed(callsign) {
        const instructed = _.map(
            Object.values(this.resolutions),
            (resolution) => resolution.callsign
        );
        return instructed.includes(callsign);
    }

    is_fix_available_for_holding(waypoint) {
        const holding_resolutions = _.filter(
            Object.values(this.resolutions),
            (resolution) =>
                resolution.instruction === RESOLUTIONS.HOLDING_PATTERN
        );

        const busy_wps = _.map(
            holding_resolutions,
            (resolution) => resolution.holding_fix
        );

        return !busy_wps.includes(waypoint);
    }

    is_false_positive_starstar(conflict) {
        if (conflict.vertical >= 800) return true;
        if (conflict.horizontal < MIN_DIST_TO_RESOLVE + 0.5) return false;

        const first = this.sim_reader.get_aircraft_by_callsign(conflict.first);
        const second = this.sim_reader.get_aircraft_by_callsign(
            conflict.second
        );

        const [x1, y1] = first.positionModel._calculateRelativePosition();
        const [x2, y2] = second.positionModel._calculateRelativePosition();

        const first_heading = rad_to_deg(first.heading);
        const second_heading = rad_to_deg(second.heading);

        const vx1 =
            first.speed * 1.852 * Math.cos(deg_to_rad(-(first_heading - 90)));
        const vy1 =
            first.speed * 1.852 * Math.sin(deg_to_rad(-(first_heading - 90)));
        const vx2 =
            second.speed * 1.852 * Math.cos(deg_to_rad(-(second_heading - 90)));
        const vy2 =
            second.speed * 1.852 * Math.sin(deg_to_rad(-(second_heading - 90)));

        const coll_time_hour =
            -(
                x1 * vx1 -
                vx1 * x2 -
                (x1 - x2) * vx2 +
                y1 * vy1 -
                vy1 * y2 -
                (y1 - y2) * vy2
            ) /
            (Math.pow(vx1, 2) -
                2 * vx1 * vx2 +
                Math.pow(vx2, 2) +
                Math.pow(vy1, 2) -
                2 * vy1 * vy2 +
                Math.pow(vy2, 2));

        const min_dist_km = Math.sqrt(
            Math.pow(coll_time_hour * vx1 - coll_time_hour * vx2 + x1 - x2, 2) +
                Math.pow(
                    coll_time_hour * vy1 - coll_time_hour * vy2 + y1 - y2,
                    2
                )
        );

        const coll_time_sec = coll_time_hour * 60 * 60;
        if (
            coll_time_sec < 0 ||
            coll_time_sec > MIN_TIME_TO_RESOLVE ||
            min_dist_km > MIN_DIST_TO_RESOLVE
        )
            return true;

        return false;
    }

    possible_resolutions_starstar(callsign) {
        if (this.already_instructed(callsign)) return null;

        const model = this.sim_reader.get_aircraft_by_callsign(callsign);
        if (_.isNil(model) || !model.isControllable) return null;

        const resolutions = [];
        if (model.fms.waypoints.length > MIN_WPS_FOR_HOLDING)
            resolutions.push(RESOLUTIONS.HOLDING_PATTERN);
        if (model.speed - SPEED_CHANGE > model.model.speed.min)
            resolutions.push(RESOLUTIONS.SPEED);

        if (resolutions.length === 0) return null;
        return resolutions;
    }

    choose_resolution_starstar(conflict) {
        const first = this.sim_reader.get_aircraft_by_callsign(conflict.first);
        const second = this.sim_reader.get_aircraft_by_callsign(
            conflict.second
        );

        const first_opts = this.possible_resolutions_starstar(conflict.first);
        const second_opts = this.possible_resolutions_starstar(conflict.second);

        const first_distance = calc_remaining_distance(first, this.fixes);
        const second_distance = calc_remaining_distance(second, this.fixes);

        let callsign = null;
        if (first_opts === null && second_opts === null) return null;
        else if (first_opts !== null && second_opts === null)
            callsign = conflict.first;
        else if (first_opts === null && second_opts !== null)
            callsign = conflict.second;
        else {
            callsign =
                first_distance > second_distance
                    ? conflict.first
                    : conflict.second;
        }

        const options = callsign === conflict.first ? first_opts : second_opts;
        if (options.includes(RESOLUTIONS.HOLDING_PATTERN))
            return {
                callsign: callsign,
                instruction: RESOLUTIONS.HOLDING_PATTERN,
            };
        else if (
            options.includes(RESOLUTIONS.SPEED) &&
            callsign ===
                (first_distance > second_distance
                    ? conflict.first
                    : conflict.second)
        )
            return {
                callsign: callsign,
                instruction: RESOLUTIONS.SPEED,
            };
        return null;
    }

    enact_resolution_starstar(conflict) {
        if (this.get_conflict_id(conflict) in this.resolutions) return null;
        if (this.is_false_positive_starstar(conflict)) return null;

        const resolution = this.choose_resolution_starstar(conflict);
        if (resolution === null) return;

        const id = this.get_conflict_id(conflict);
        const { callsign, instruction } = resolution;
        const model = this.sim_reader.get_aircraft_by_callsign(callsign);

        if (instruction === RESOLUTIONS.HOLDING_PATTERN) {
            const fix = model.fms.waypoints[0]._name;
            if (!this.is_fix_available_for_holding(fix)) {
                this.sim_writer.send_command(
                    `${callsign} climb ${HOLDING_UNAVAILABLE_ALT / 100}`
                );
                this.resolutions[id] = {
                    conflict: conflict,
                    callsign: callsign,
                    instruction: RESOLUTIONS.ALTITUDE,
                    altitude: 1700,
                    timestamp: RESOLUTION_TIME,
                };
                console.log(
                    `[CONFLICT RESOLVER] ${callsign} HAS BEEN INSTRUCTED TO DESCEND TO FL17`
                );
                this.attempted_resolutions += 1;
            } else {
                const new_altitude = (model.altitude + ALTITUTDE_CHANGE) / 100;
                this.sim_writer.send_command(
                    `${callsign} hold ${fix} climb ${new_altitude}`
                );
                this.resolutions[id] = {
                    conflict: conflict,
                    callsign: callsign,
                    instruction: RESOLUTIONS.HOLDING_PATTERN,
                    altitude: new_altitude * 100,
                    holding_fix: fix,
                    timestamp: RESOLUTION_TIME * 2,
                };
                console.log(
                    `[CONFLICT RESOLVER] ${callsign} HAS BEEN INSTRUCTED TO HOLD AT ${fix}`
                );
                this.attempted_resolutions += 1;
            }
        } else if (instruction === RESOLUTIONS.SPEED) {
            const new_speed = model.speed - SPEED_CHANGE;
            if (model.model.isAbleToMaintainSpeed(new_speed)) {
                this.sim_writer.send_command(`${callsign} speed ${new_speed}`);
                this.resolutions[id] = {
                    conflict: conflict,
                    callsign: callsign,
                    instruction: RESOLUTIONS.SPEED,
                    speed: new_speed,
                    timestamp: RESOLUTION_TIME,
                };
                console.log(
                    `[CONFLICT RESOLVER] ${callsign} HAS BEEN INSTRUCTED TO REDUCE SPEED BY ${SPEED_CHANGE}KTS`
                );
                this.attempted_resolutions += 1;
            }
        }
    }

    update_resolutions() {
        const resolved = [];
        for (const resolution of Object.values(this.resolutions)) {
            resolution.timestamp -= TIME_DECREMENT_STEP;
            const first_callsign = resolution.conflict.first;
            const second_callsign = resolution.conflict.second;
            const instructed_model = this.sim_reader.get_aircraft_by_callsign(
                resolution.callsign
            );
            const conflict_id = this.get_conflict_id(resolution.conflict);

            if (_.isNil(instructed_model)) {
                resolved.push(conflict_id);
                this.resolved_conflicts += 1;
                this.los_already_recorded[conflict_id] = false;
                continue;
            }

            if (resolution.timestamp <= 0) {
                if (
                    this.sim_reader.are_callsigns_in_conflict(
                        first_callsign,
                        second_callsign
                    )
                )
                    resolution.timestamp = RESOLUTION_TIME;
                else {
                    if (resolution.instruction == RESOLUTIONS.HOLDING_PATTERN) {
                        if (!instructed_model.isControllable) {
                            resolution.timestamp = 15;
                            continue;
                        }

                        let dvs_cmd = "";
                        if (instructed_model.altitude > ARRIVAL_ASSIGNED_ALT)
                            dvs_cmd = `dvs ${ARRIVAL_ASSIGNED_ALT / 100}}`;

                        this.sim_writer.send_command(
                            `${instructed_model.callsign} exithold ${dvs_cmd}`
                        );
                    }

                    resolved.push(conflict_id);
                    this.resolved_conflicts += 1;
                    this.los_already_recorded[conflict_id] = false;
                }
            }
        }

        for (const id of resolved) delete this.resolutions[id];
    }

    // handle_critical_conflicts_starstar(conflicts) {
    //     _.remove(conflicts, (conflict) => {
    //         if (conflict.vertical <= 0.5 && conflict.horizontal <= 0.5) {
    //             const first = this.sim_reader.get_aircraft_by_callsign(
    //                 conflict.first
    //             );
    //             const second = this.sim_reader.get_aircraft_by_callsign(
    //                 conflict.second
    //             );

    //             const first_distance = calc_remaining_distance(
    //                 first,
    //                 this.fixes
    //             );
    //             const second_distance = calc_remaining_distance(
    //                 second,
    //                 this.fixes
    //             );

    //             const callsign =
    //                 first_distance > second_distance
    //                     ? conflict.first
    //                     : conflict.second;
    //             const model = this.sim_reader.get_aircraft_by_callsign(
    //                 callsign
    //             );

    //             const new_altitude = (model.altitude + ALTITUTDE_CHANGE) / 100;
    //             this.sim_writer.send_command(
    //                 `${callsign} climb ${new_altitude}`
    //             );
    //             return true;
    //         }
    //         return false;
    //     });
    // }

    step_starstar(conflicts) {
        this.update_resolutions();
        // this.handle_critical_conflicts_starstar(conflicts);
        for (const conflict of conflicts) {
            const conflict_id = this.get_conflict_id(conflict);
            if (
                conflict.vertical < LOSS_OF_SEPARATION_ALT &&
                conflict.horizontal < LOSS_OF_SEPARATION_DIST &&
                !this.los_already_recorded[conflict_id]
            ) {
                this.loss_of_separations += 1;
                this.los_already_recorded[conflict_id] = true;
            }

            this.enact_resolution_starstar(conflict);
        }

        console.log(
            `[CONFLICT RESOLVER] ${this.resolved_conflicts} OUT OF ${this.attempted_resolutions} RESOLUTIONS HAVE BEEN SUCCESSFUL`
        );
        console.log(
            `[CONFLICT RESOLVER] ${this.loss_of_separations} LOSS OF SEPARATIONS HAVE OCCURRED SO FAR`
        );
    }
}
