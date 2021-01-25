export default class Reader {
    constructor(app_controller) {
        this.app_controller = app_controller;
    }

    get_all_aircraft_models() {
        return this.app_controller.aircraftController.aircraft.list;
    }
}
