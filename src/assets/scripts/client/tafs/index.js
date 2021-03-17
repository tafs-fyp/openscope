import Reader from "./io/Reader";
import Writer from "./io/Writer";
import DepartureManager from "./departure-manager";
import Detector from "./conflict-detection/detector"
export default class Agent {


    constructor(app_controller) {

        this.app_controller = app_controller;
        this.sim_reader = new Reader(this.app_controller);
        this.sim_writer = new Writer(this.app_controller);
        
        this.departure_manager = new DepartureManager(
            this.sim_reader,
            this.sim_writer
        );
            
        
        this.detector = new Detector(this.app_controller.getAircraftController())
    }

    step() {
        console.log("Executing Step");
        this.departure_manager.step();
        this.detector.step();
    }
}
