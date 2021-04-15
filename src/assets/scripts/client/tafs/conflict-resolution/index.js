import _ from "lodash";

/**
 * Resolving Conflicts:
 * Objective: Resolve conflicts that could arise due to the loss of horizontal or vertical spacing between two aircraft.
 * 
 * Scenarios:
 *  There are four potential scenarios
 *      1.  Both aircrafts are flying SID
 *      2.  Both aircrafs are flying STAR
 *      3.  One is flying SID and ther other STAR
 *      4.  One is flying STAR and ther other SID
 * 
 * Possible Resolutions:
 * 
 * If both are Flying SID, we have the following options
 *  1. Increase Altitude {7000,8000,9000,10000} //what is the maximum altitude an aircraft fly
 *  2. Increase Speed{+-25}//check if clambing is being performed. //whatis the maximum speed an aircraft can fly.
 *  3. Possibly Proceed Direct to the [current + 2 ... N] waypoint to leading aircraft + speed increase. Lowest priority.
 * 
 * If Both are flying STAR, we the the following options
 *  1. Decrease Altitude.// min altitude restrictions still hold. ILS main masla
 *  2. Decrease the Altitude of the leading(nearer to airport) aircraft.
 *  3. Make the leading aircraft proceed direct to the last waypoint(i.e one before the ILS) along with decreasing it altitude to 3000-2000 range.
 *  4. Holding pattern pichle wala.
 *  6. Seek human help if aircrafts are in the vicinity of an dirport(at a cetail distance. 15KM)
 * 
 * 
 * If one is flying SID and the other is flying STAR, the possible resolutions are
 *  1. Ask the one flying SID to climb higher
 *  2. Ask the one flying STAR to climb down(minimum altitude assigned is as per the STAR)
 *  3. Ask the aircraft flying STAR to lower its speed meanwhile asking the other to increase it.
 *  4. Make the one flying SID proceed direct to the last waypoint in its plan.
 *  5. Ask the STAR one to adopt holding pattern
 * 
 * Resolution Algorithm:
 *  detect conflicts
 *  determine the catergory in which they fall
 *  Give them a random direction from the ones available. 
 *  Store the pair of conflicting aircraft in a list, their vertical and horizonatal seperation and the resolution made previously.
 *  After some time x, check if the seperation between them has increased or not. 
 *  if not: suggest another resolution
 *  Repeat 
 * 
 */

//Each resolution made is stored in resolutionsMade with timestamp.
//If the timestamp >0. No more resolutions can be suggesed.
//if the timestamp is 0. Latest seperations are compared with previous seperations
    //if the seperations has incresed, we remove the id
    //otherwise suggest new resolution


 const Resolutions = {
    Altitude:       1,
    Speed:          2,
    ProceedDirect:  3
 };
  
 const SPEEDINCREMENT    = 25;      //we will increment the speed by 25 knots.
 const ALTITUDEINCREMENT = 1000;    //altitude increment factor
 const TIMESTAMP         = 10;

 const sampleResolution = function () {

    const results = [];
    const Resolutions = [1, 2, 3];
    const remaining = new Set(Resolutions);

    const probabilities = [0.45, 0.45, 0.1];

    for(let i = 0; i < Resolutions.length; i++){
      const r  = Math.random();
      const letter = Resolutions[i];

      if(r < probabilities[i] && remaining.has(letter)){
        results.push(letter);
        remaining.delete(letter);
      }
      else{
        const rand = Math.floor(Math.random()*remaining.size);
        const x = Array.from(remaining)[rand];
        remaining.delete(x);
        results.push(x);
      }

    }
     return results;
  };

//determine which aircraft is ahead usign both distance from the airport and next waypoint
class SIDConflictResolver
{
    //Receives a list of conflicting aircraft flying SID 
    //Receives sim reader and writer.
    constructor(conflicts,reader,writer) {

        this.conflicts  = conflicts; //list of all aircrafts.
        this.sim_reader = reader;
        this.sim_writer = writer;
        this.resolutionsMade = {};
        this.probbingNeededResolutions = {};
        this.sidAircraftModels = this.sim_reader.get_all_sids();

    }

    getTargetCallSignForAltitudeIncrement(conflict)
    {
        const index = Math.random() % 2;
        return index == 0 ? conflict.first : conflict.second;
    }

    updateResolutionsMade(conflict)
    {
        const id = (conflict.first+conflict.second).split('').sort().join('');
        this.resolutionsMade[id] = {
            conflict: conflict,
            vertical : conflict.vertical,
            horizontal : conflict.horizontal,
            time : TIMESTAMP
        };
    }

    getAirCraftModel(callsign)
    {
        var i = 0;
        for(i = 0; i < this.sidAircraftModels.length; i++) {
            if(callsign === this.sidAircraftModels[i].getCallsign()){
                return this.sidAircraftModels[i];
            }
        }
    }

    getCurrentAltitude(callsign)
    {
        var i = 0;
        for(i = 0; i < this.sidAircraftModels.length; i++){
            if(callsign === this.sidAircraftModels[i].getCallsign()){
                return this.sidAircraftModels[i].altitude;
            }
        }
    }

    getCurrentSpeed(callsign)
    {
        var i = 0;
        for(i = 0; i < this.sidAircraftModels.length; i++){
            if(callsign === this.sidAircraftModels[i].getCallsign()){
                return this.sidAircraftModels[i].speed;
            }
        }
    }

    resolutionViaAltitude(conflict)
    {
        const targetCallsign = getTargetCallSignForAltitudeIncrement(conflict); 
        const id = (conflict.first+conflict.second).split('').sort().join('');
        const newAltitude = Math.floor((this.getCurrentAltitude(targetCallsign) + ALTITUDEINCREMENT)/100);      
        const model = this.getAirCraftModel(targetCallsign);     
        if(model.model.isAbleToMaintainAltitude(newAltitude)){
            this.sim_writer.send_command(  //For SID only altitude can be increased
            `${targetCallsign} climb ${newAltitude}` 
            );
            updateResolutionsMade(conflict);
        }
    }

//TODO: If an ID areadly exist and it's seperating is increasing, don't make any new resolution
    resolutionViaSpeed(conflict)
    {   
        const index = Math.random() % 2;

        const incCallSign = index === 0 ? conflict.first : conflict.second;
        const decCallSign = index === 1 ? conflict.first : conflict.second;


        const id = (conflict.first+conflict.second).split('').sort().join('');
        const IncNewSpeed = SPEEDINCREMENT + getCurrentSpeed(incCallSign);
        const decNewSpeed = + getCurrentSpeed(decCallSign) - SPEEDINCREMENT;

        const incModel = this.getAirCraftModel(IncNewSpeed);     
        const decModel = this.getAirCraftModel(decCallSign);
        
        if(incModel.model.isAbleToMaintainSpeed(IncNewSpeed) && decModel.isAbleToMaintainSpeed(decNewSpeed)){
            this.sim_writer.send_command(
                `${incCallSign} speed ${IncNewSpeed}`
            );
            this.sim_writer.send_command(
                `${decCallSign} speed ${decNewSpeed}`
            );

            this.probbingNeededResolutions[id] = {
                conflict:       conflict,           //conflicting pair
                IncDirectedTo:  IncNewSpeed,        //aircraft directed to increase speed
                DecDirectedTo:  decNewSpeed,        //aircraft directed to decrease speed
                vertical:       conflict.vertical,  
                horizontal:     conflict.horizontal
            };
            updateResolutionsMade(conflict);
        }
    }

    resolutionViaProceedDirect(conflict)
    {
        const index = Math.random() % 2;
        const targetCallsign = index === 0 ? conflict.first : conflict.second;
        const id = (conflict.first+conflict.second).split('').sort().join('');
        const waypoints = getAirCraftModel(targetCallsign).fms.waypoints;

        if(waypoints.length > 1)
        {   var index = 0;
            if (waypoints.length === 2){
                index = 1;
            }
            else 
            {
                index = Math.floor(Math.random() * ((waypoints.length - 1) - 2) + 2);
            }

            const lastwp = waypoints[index]._name;
            this.sim_writer.send_command(
                `${targetCallsign} pd ${lastwp}`
            );
            updateResolutionsMade(conflict);
        }
    }
    updateOldResolutions() // this will be binded in an external callback
    {
        for (let key in this.resolutionsMade) {
            this.resolutionsMade[key].time -= 1;
        }
    }
    step()
    {
        var i = 0;
        for(i = 0; i < this.conflicts.length; i++)
        {
            let conf = this.conflicts[i];
            
            const id = (conf.first+conf.second).split('').sort().join('');

            if(this.resolutionsMade[id].time > 0){ continue;}
            
            if(this.resolutionsMade[id].time == 0 && conf.vertical > this.resolutionsMade[id].vertical && conf.horizontal > this.resolutionsMade[id].horizontal) {
                delete this.resolutionsMade[id]; //a resolved conflict
                continue;
            }


            let res1 = sampleResolution()[0];
            let res2 = sampleResolution()[0];
            if(res1 === Resolutions.ProceedDirect && res2 === Resolutions.ProceedDirect)
            {
                //A single plane
                this.resolutionViaProceedDirect(conf);
            }
            else if(res1 === Resolutions.Altitude || res2 === Resolutions.Altitude)
            {
                //A single plane only
                this.resolutionViaAltitude(conf);
            }
            else //speed resolution
            { 
                //Both Planes 
                this.resolutionViaSpeed(conf);
            }
        }
    }
}



//climb on 10000 for SID
/* What if clash occur amid ILS??
*
*  // obtain airfrats from Reader
*  // 
*
*
*
*
*   //aircraft.fms.waypoints //returns
*   //sid expansion : a,b,c,d,e,f,g,h  
*
*
*   //aircraft has property altitude, speed{ground,indicated airspeed,}
*
*   //distance from airport: aircraft's property{aircraft model}
*
*   //way point altitude and speed restrictions
*   climb via sid acsend to 8000(does it forget its SID)
*   Way point is defined Fm system/Waypoint model.js. check fms.js too.
*   route model encapsulate fms
*/


/*
*



//pull



*/

//displacement from airport:  
    //if both have no common next waypoint

//