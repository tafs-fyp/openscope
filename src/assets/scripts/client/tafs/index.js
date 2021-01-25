import Reader from "./io/Reader";
import Writer from "./io/Writer";
import DepartureManager from "./departure-manager";

export default class Agent {
    constructor(app_controller) {
        this.app_controller = app_controller;
        this.sim_reader = new Reader(this.app_controller);
        this.sim_writer = new Writer(this.app_controller);

        this.departure_manager = new DepartureManager(
            this.sim_reader,
            this.sim_writer
        );
    }

    step() {
        console.log("Executing Step");
        this.departure_manager.step();
    }
}
