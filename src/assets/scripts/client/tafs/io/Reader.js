import { FLIGHT_CATEGORY } from "../../constants/aircraftConstants";
import { PROCEDURE_TYPE } from "../../constants/routeConstants";

import FixCollection from "../../navigationLibrary/FixCollection";
import NavigationLibrary from "../../navigationLibrary/NavigationLibrary";
import AirportController from "../../airport/AirportController";
import _ from "lodash";

export default class Reader {
    constructor(app_controller) {
        this.app_controller = app_controller;
    }

    get_all_fixes() {
        return FixCollection._items;
    }

    get_real_fixes() {
        return FixCollection.findRealFixes();
    }

    get_all_sids() {
        return NavigationLibrary.getProceduresByType(PROCEDURE_TYPE.SID);
    }

    get_all_stars() {
        return NavigationLibrary.getProceduresByType(PROCEDURE_TYPE.STAR);
    }

    get_all_aircrafts() {
        return this.app_controller.aircraftController.aircraft.list;
    }

    get_departure_aircrafts() {
        return this.get_all_aircrafts().filter(
            (aircraft) => aircraft.category === FLIGHT_CATEGORY.DEPARTURE
        );
    }

    get_arrival_aircrafts() {
        return this.get_all_aircrafts().filter(
            (aircraft) =>
                aircraft.category === FLIGHT_CATEGORY.ARRIVAL &&
                aircraft.isControllable
        );
    }

    get_aircraft_by_callsign(callsign) {
        return this.app_controller.aircraftController.findAircraftByCallsign(
            callsign
        );
    }

    are_callsigns_in_conflict(first_callsign, second_callsign) {
        const first = this.get_aircraft_by_callsign(first_callsign);
        const second = this.get_aircraft_by_callsign(second_callsign);

        if (_.isNil(first) || _.isNil(second)) return false;
        return (
            second_callsign in first.conflicts ||
            first_callsign in second.conflicts
        );
    }

    get_runways() {
        return AirportController.airport_get().runways;
    }

    get_wind() {
        return AirportController.airport_get().getWindAtAltitude();
    }
}
