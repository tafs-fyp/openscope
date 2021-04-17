import Reader from "./io/Reader";
import Writer from "./io/Writer";

import DepartureManager from "./departure-manager";
import ArrivalManager from "./arrival-manager";
import Detector from "./conflict-detection/detector";
import ConflictResolution from "./conflict-resolution";

export default class Agent {
    constructor(app_controller) {
        this.app_controller = app_controller;
        this.sim_reader = new Reader(this.app_controller);
        this.sim_writer = new Writer(this.app_controller);

        this.departure_runways = [];
        this.arrival_runways = [];
        this.choose_runways();

        this.departure_manager = new DepartureManager(
            this.sim_reader,
            this.sim_writer,
            this.departure_runways
        );

        this.arrival_manager = new ArrivalManager(
            this.sim_reader,
            this.sim_writer,
            this.arrival_runways
        );

        this.sidsidresolver = new ConflictResolution(
            this.sim_reader,
            this.sim_writer,
            5
        );

        this.detector = new Detector(
            this.app_controller.getAircraftController(),
            this.sim_reader,
            this.sidsidresolver
        );
        setInterval(this.step.bind(this), 10000);
        setInterval(this.detectorAndResolverStep.bind(this), 5000);
        setInterval(this.logAnalytics.bind(this), 10000);
    }

    choose_runways(dep_num = 1, arr_num = 1) {
        const wind = this.sim_reader.get_wind();
        const runway_pairs = this.sim_reader.get_runways();
        if (dep_num + arr_num < runway_pairs.length) return;

        for (let i = 0; i < dep_num; ++i) {
            const runway_pair = runway_pairs[i];

            const headwind_0 =
                Math.cos(runway_pair[0].angle - wind.angle) * wind.speed;
            const tailwind_0 =
                Math.cos(runway_pair[1].angle - wind.angle) * wind.speed;

            if (headwind_0 > tailwind_0)
                this.departure_runways.push(runway_pair[0].name);
            else this.departure_runways.push(runway_pair[1].name);
        }

        for (let i = dep_num; i < dep_num + arr_num; ++i) {
            const runway_pair = runway_pairs[i];

            const headwind_0 =
                Math.cos(runway_pair[0].angle - wind.angle) * wind.speed;
            const tailwind_0 =
                Math.cos(runway_pair[1].angle - wind.angle) * wind.speed;

            if (headwind_0 > tailwind_0)
                this.arrival_runways.push(runway_pair[0].name);
            else this.arrival_runways.push(runway_pair[1].name);
        }
    }

    step() {
        this.departure_manager.step();
        this.arrival_manager.step();
    }

    detectorAndResolverStep() {
        //this.sidsidresolver.updateOldResolutions();
        this.detector.step();
    }

    logAnalytics() {
        this.sidsidresolver.logAnalytics();
    }
}
