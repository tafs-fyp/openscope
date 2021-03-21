import { FLIGHT_PHASE } from "../../constants/aircraftConstants";
import { PROCEDURE_TYPE } from "../../constants/routeConstants";
import FixCollection from "../../navigationLibrary/FixCollection";
import NavigationLibrary from "../../navigationLibrary/NavigationLibrary";

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

    get_all_aircrafts() {
        return this.app_controller.aircraftController.aircraft.list;
    }

    get_departure_aircrafts() {
        return this.get_all_aircrafts().filter(
            (aircraft) => aircraft.flightPhase === FLIGHT_PHASE.APRON
        );
    }
}
