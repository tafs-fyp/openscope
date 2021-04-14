/**
 * Resolving Conflicts:
 * Objective: Resolve conflicts that could arise due to the loss of horizontal or vertical spacing between two aircraft.
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
 *  1. Increase Altitude
 *  2. Increase Speed
 *  3. Possibly Proceed Direct to the ending waypoint
 * 
 * If Both are flying STAR, we the the following options
 *  1. Decrease Altitude.
 *  2. Decrease the Altitude of the trailing aircraft.
 *  3. Make the leading aircraft proceed direct to the last waypoint(i.e one before the ILS) along with decreasing it altitude to 3000-2000 range
 * 
 * If one is flying SID and the other is flying STAR, the possible resolutions are
 *  1. Ask the one flying SID to climb higher
 *  2. Ask the one flying STAR to climb down(minimum altitude assigned is as per the STAR)
 *  3. Ask the aircraft flying STAR to lower its speed meanwhile asking the other to increase it.
 *  4. Make the one flying SID proceed direct to the last waypoint in its plan.
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

/*
*







*/