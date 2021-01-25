export default class DepartureManager {
    constructor(reader, writer) {
        this.sim_reader = reader;
        this.sim_writer = writer;
    }

    step() {
        console.log("Executing Departure Manger");
    }
}
