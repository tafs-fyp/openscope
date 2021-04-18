import _ from "lodash";
import { distanceToPoint } from "../../math/circle";

const SPEED_CHANGE = 25;
const ALTITUTDE_CHANGE = 1000;
const RESOLUTION_TIME = 30;
const TIME_DECREMENT_STEP = 5;

const RESOLUTIONS = {
    SPEED: 1,
    ALTITUDE: 2,
    PROCEED_DIRECT: 3,
    HOLDING_PATTERN: 4,
};

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
        const first = this.sim_reader.get_aircraft_by_callsign(conflict.first);
        const second = this.sim_reader.get_aircraft_by_callsign(
            conflict.second
        );

        const first_heading = first.heading * (180 / Math.PI);
        const second_heading = second.heading * (180 / Math.PI);

        const diff_heading = Math.abs(first_heading - second_heading);
        if (diff_heading >= 175 && diff_heading <= 185) {
            const bearing =
                first.positionModel.bearingToPosition({
                    latitude: second.positionModel.latitude,
                    longitude: second.positionModel.longitude,
                }) *
                (180 / Math.PI);

            if (Math.abs(bearing - first_heading) > 5) return true;
        }
        return false;
    }

    possible_resolutions_starstar(callsign) {
        if (this.already_instructed(callsign)) return null;

        const model = this.sim_reader.get_aircraft_by_callsign(callsign);
        if (_.isNil(model) || !model.isControllable) return null;

        const resolutions = [];
        if (model.fms.waypoints.length > 3)
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

        let callsign = null;
        if (first_opts === null && second_opts === null) return null;
        else if (first_opts !== null && second_opts === null)
            callsign = conflict.first;
        else if (first_opts === null && second_opts !== null)
            callsign = conflict.second;
        else {
            const first_distance = calc_remaining_distance(first, this.fixes);
            const second_distance = calc_remaining_distance(second, this.fixes);
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
        else if (options.includes(RESOLUTIONS.SPEED))
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
                this.sim_writer.send_command(`${callsign} climb 17`);
                this.resolutions[id] = {
                    conflict: conflict,
                    callsign: callsign,
                    instruction: RESOLUTIONS.ALTITUDE,
                    altitude: 1100,
                    timestamp: RESOLUTION_TIME,
                };
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

            if (_.isNil(instructed_model)) {
                resolved.push(this.get_conflict_id(resolution.conflict));
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
                        let dvs_cmd = "";
                        if (instructed_model.altitude > 2000)
                            dvs_cmd = "dvs 20";

                        this.sim_writer.send_command(
                            `${instructed_model.callsign} exithold ${dvs_cmd}`
                        );
                    }

                    resolved.push(this.get_conflict_id(resolution.conflict));
                    this.resolved_conflicts += 1;
                }
            }
        }

        for (const id of resolved) delete this.resolutions[id];
    }

    handle_critical_conflicts_starstar(conflicts) {
        _.remove(conflicts, (conflict) => {
            if (conflict.vertical <= 0.5 && conflict.horizontal <= 0.5) {
                const first = this.sim_reader.get_aircraft_by_callsign(
                    conflict.first
                );
                const second = this.sim_reader.get_aircraft_by_callsign(
                    conflict.second
                );

                const first_distance = calc_remaining_distance(
                    first,
                    this.fixes
                );
                const second_distance = calc_remaining_distance(
                    second,
                    this.fixes
                );

                const callsign =
                    first_distance > second_distance
                        ? conflict.first
                        : conflict.second;
                const model = this.sim_reader.get_aircraft_by_callsign(
                    callsign
                );

                const new_altitude = (model.altitude + ALTITUTDE_CHANGE) / 100;
                this.sim_writer.send_command(
                    `${callsign} climb ${new_altitude}`
                );
                return true;
            }
            return false;
        });
    }

    step_starstar(conflicts) {
        this.update_resolutions();
        this.handle_critical_conflicts_starstar(conflicts);
        for (const conflict of conflicts) {
            this.enact_resolution_starstar(conflict);
        }
    }
}
