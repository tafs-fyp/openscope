
//FYP TODOs
/*
1. Change the radius of conflict detection
2. Made a simple algorithm for resolving conflicts. 

*/ 

export default class Detector {
    constructor(aircraftController) {
        this.aircraftcontroller = aircraftController;
        this.count = 0;
    }

    getConflicts(){
        //gets an array of AircraftConflict Object
        return this.aircraftcontroller.getConflicts();
    }

    step(){
        //console.log("Total conflicts: " + this.getConflicts().length)
        let conflicts = this.getConflicts();
        if(conflicts.length > 0){
            var i;
            for(i = 0; i < conflicts.length; i++){
                let seps = conflicts[i].getSeperations();
                let first = conflicts[i].getConflictingAirCrafts()[0].getInformation();
                let second = conflicts[i].getConflictingAirCrafts()[1].getInformation();
                let aircraft = first['callsign'];
                let aircraft2 = second['callsign'];
                
                console.log(aircraft + ' and ' + aircraft2 + 'are apart Horizontally: '+seps['horizontal'] + ', Vertically: '+seps['vertical']);
               // this.count+=1;
            }
        }
    }
}

/*
getInformation(){
        return {
            "id":this.id,
            "airline" :this.airlineId,
            "flightNumber" : this.flightNumber
        };
    }
*/
//     getConflicts() {
//         return this.aircraftcontroller.getConflicts();
//     }

//     step() {
//         // console.log("Total conflicts: " + this.getConflicts().length);
//     }
// }
