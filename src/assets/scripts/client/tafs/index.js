import Reader from "./io/Reader";
import Writer from "./io/Writer";

export default class Agent {
    constructor(app_controller) {
        this.app_controller = app_controller;
        this.sim_reader = new Reader(this.app_controller);
        this.sim_writer = new Writer(this.app_controller);
    }

    step() {
        console.log("Executing Step");
    }
}
