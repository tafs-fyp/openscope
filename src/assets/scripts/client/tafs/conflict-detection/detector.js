


export default class Detector {
    
    constructor(aircraftController){
        this.aircraftcontroller = aircraftController;
    }

    getConflicts(){
        return this.aircraftcontroller.getConflicts();
    }

    step(){
        console.log("Total conflicts: " + this.getConflicts().length)
    }
}