
//FYP TODOs
/*
1. Change the radius of conflict detection
2. Made a simple algorithm for resolving conflicts. 

*/ 

import _ from "lodash";

export const ConflitCategories = {
    SIDSID: 1,
    STARSTAR: 2,
    SIDSTAR: 3
 };
 

export default class Detector {
    constructor(aircraftController,reader) {
        this.aircraftcontroller = aircraftController;
        this.sim_reader = reader;
        this.aircrafts = this.sim_reader.get_all_aircrafts();

        this.count = 0; //how many conflicts were detected
    }

    doesAircraftExist(aircaft,elements)
    {
        var i = 0;
        for(i = 0; i < elements.length; i++)
        {
            if(aircaft['callsign'] === elements[i].getCallsign()) {return true;}
        }
        return false;
    }   

    getConflictsFor(allconflicts,lookup,catergory)
    {
        let conflicts = [];
        var i = 0;
        for(i =0; i < allconflicts.length;i++){
            let seperations = allconflicts[i].getSeperations();
            let first = allconflicts[i].getConflictingAirCrafts()[0].getInformation();
            let second = allconflicts[i].getConflictingAirCrafts()[1].getInformation();
            if(this.doesAircraftExist(first,lookup) && this.doesAircraftExist(second,lookup))
            {
                conflicts.push(
                    {
                     first:first['callsign'],
                     second:second['callsign'],
                     vertical: seperations['vertical'],
                     horizontal : seperations['horizontal'],
                     nature :catergory   
                    });
            }
        }
        return conflicts;
    }

    step(){

        
        let conflicts = this.aircraftcontroller.getConflicts();
        this.count += conflicts.length;
        console.log(`waypoints of ${this.aircrafts[0].getCallsign()} are `);
        console.log(this.aircrafts[0].fms.waypoints[0]._name);
        
        if(conflicts.length > 0){
            let sidconflicts     =  this.getConflictsFor(conflicts,this.sim_reader.get_departure_aircrafts(),ConflitCategories.SIDSID);
            let starconflicts    =  this.getConflictsFor(conflicts,this.sim_reader.get_arrival_aircrafts(),ConflitCategories.STARSTAR);
            let sidstarconflicts =  this.getConflictsFor(conflicts,this.sim_reader.get_all_aircrafts(),ConflitCategories.SIDSTAR);

            if(sidconflicts.length > 0){
                //ask sid resolver to resolve
            }
            if(starconflicts.length>0){
                //ask star resolver to resolve
                var i = 0;
                for(i = 0; i < starconflicts.length; i++ )
                {
                    // console.log(starconflicts[i]);
                    var j = 0;
                    for(j = 0; j < starconflicts.length; j++){
                        let allstarcrafts = this.sim_reader.get_arrival_aircrafts();
                        var k = 0;
                        for(k = 0; k < allstarcrafts.length; k++)
                        {
                            if(starconflicts[i].first === allstarcrafts[k].getCallsign())
                            {
                                console.log("First Current Altitude: "+allstarcrafts[k].altitude);
                            }
                            if(starconflicts[i].second === allstarcrafts[k].getCallsign())
                            {
                                // console.log(`last waypoint of ${allstarcrafts[k].getCallsign()} === ${_.last(allstarcrafts[k].fms.waypoints) }`);
                            }

                        }
                    }
                }
            }
            if(sidstarconflicts.length > 0){
                //ask sidstar resolver to resolve
            }
        }
   
    }
   
}

