'use strict';
(function() {
    $(document).ready(function() {

        var reportedPowerOutages = [];
        var repairCrews = [];
        var simulationTime = 0; //simulation times measured in hours
        var stormIsActive = true;
        var stormEnds = 6; //storm ends at 6
        var simulationIsNotComplete = true;
        var personHoursWithoutElectricity = 0;

        var recordedResults = [];

        var speedLimit = 60;
        var distanceFactor = 1;
        var peopleFactor = 1;
        var generalBusinessFactor = 1;
        var specificBusinessFactor = {
            cable: {weight: 1, canRepairBeforeStormEnds: false},
            residential: {weight: 1, canRepairBeforeStormEnds: false},
            hospital: {weight: 10, canRepairBeforeStormEnds: true},
            railroad: {weight: 2, canRepairBeforeStormEnds: true},
            area: {weight: 1, canRepairBeforeStormEnds: false},
            cityHall: {weight: 1, canRepairBeforeStormEnds: false},
            fireDepartment: {weight: 8, canRepairBeforeStormEnds: false},
            industry: {weight: 1, canRepairBeforeStormEnds: false},
            highSchool: {weight: 1, canRepairBeforeStormEnds: false},
            elementarySchool: {weight: 1, canRepairBeforeStormEnds: false},
            restaurant: {weight: 1, canRepairBeforeStormEnds: false},
            policeStation: {weight: 5, canRepairBeforeStormEnds: false},
            college: {weight: 1, canRepairBeforeStormEnds: false},
            stores: {weight: 1, canRepairBeforeStormEnds: false},
            trafficLights: {weight: 50, canRepairBeforeStormEnds: false},
            bank: {weight: 1, canRepairBeforeStormEnds: false},
            civicCenter: {weight: 1, canRepairBeforeStormEnds: false},
            airport: {weight: 2, canRepairBeforeStormEnds: false},
            shoppingMall: {weight: 1, canRepairBeforeStormEnds: false}
        }
        var repairTimeFactor = 1;
        var waitTimeFactor = 1;

        var numberOfRepairCrewsAtEachLocation = 5; //one crew has to stay at home base at all times

        var allPowerOutages = [];

        //Simulation functions
        function powerOutageUrgency(potentialRepairCrew) {
            var MAXDISTANCE = 230;

            //taxicab geometry
            var distance = (MAXDISTANCE - (Math.abs(this.x - potentialRepairCrew.x) + Math.abs(this.y - potentialRepairCrew.y))) * distanceFactor / speedLimit;
            var people = this.peopleAffected * peopleFactor;
            var business = specificBusinessFactor[this.business].weight * generalBusinessFactor;
            var repairTime = (1 / this.repairEstimate) * repairTimeFactor;
            var waitTime = (simulationTime - this.reportedTime) * waitTimeFactor;

            var urgency = distance + people + business + repairTime + waitTime;

            return urgency;
        }

        var powerOutageNumber = 1;
        function PowerOutageEvent(x, y, business, peopleAffected, repairEstimate, reportedTime, repairCrew) {
            this.x = x;
            this.y = y;
            this.business = business;
            this.peopleAffected = peopleAffected;
            this.repairEstimate = repairEstimate;
            this.reportedTime = reportedTime;
            this.repairCrew = repairCrew;
            this.isReported = false;
            this.workStartTime = -1;
            this.isFixed = false;
            this.powerOutageUrgency = powerOutageUrgency;
            this.powerOutageNumber = powerOutageNumber;

            powerOutageNumber++;
        }

        function isCrewAvailable() {
            return !this.powerOutage || this.powerOutage.repairEstimate === 0;
        }

        function hasTime(outage) {
            var travelTimeToOutage = (Math.abs(this.x - outage.x) + Math.abs(this.y - outage.y)) / speedLimit;
            var travelHomeFromOutage = (Math.abs(outage.x - this.homeX) + Math.abs(outage.y - this.homeY)) / speedLimit;
            var totalTime = travelHomeFromOutage + travelTimeToOutage + outage.repairEstimate;

            if (this.nextShiftStartTime == null) {
                return 16 >= totalTime;
            }
            else {
                return (this.nextShiftStartTime - simulationTime - 8) >= totalTime;
            }

        }

        var crewNumber = 1;
        function RepairCrew(x, y, powerOutage) {
            this.x = x;
            this.y = y;
            this.homeX = x;
            this.homeY = y;
            this.nextShiftStartTime = null;

            this.crewNumber = crewNumber;
            this.hasTime = hasTime;
            this.powerOutage = powerOutage;
            this.isCrewAvailable = isCrewAvailable;

            crewNumber++;
        }

        function resetSimulation() {
            reportedPowerOutages = [];
            repairCrews = [];
            allPowerOutages = [];
            simulationIsNotComplete = true;
            stormIsActive = true;
            personHoursWithoutElectricity = 0;

            crewNumber = 1;
            powerOutageNumber = 1;

            $("#outputLog").html("<p>Starting simulation...</p>");
            for (var i = 0; i < numberOfRepairCrewsAtEachLocation; i++) {
                repairCrews.push(new RepairCrew(0, 0, null, null));
                repairCrews.push(new RepairCrew(40, 40, null, null));
            }

            generateNewOutageSet();

            simulationTime = 0;

            speedLimit = $("#speedLimit").val();
            distanceFactor = $("#distanceFactor").val();
            peopleFactor = $("#peopleFactor").val();
            generalBusinessFactor = $("#generalBusinessFactor").val();
            repairTimeFactor = $("#repairTimeFactor").val();
            waitTimeFactor = $("#waitTimeFactor").val();

            runSimulation();
        }

        function nextEvent() {
            var nextEventTime = 999;
            var nextEventExists = false;
            var outagesWithoutCrews = [];
            var nextEvent = null;
            var nextEventDescription = "";

            //check for new outage
            for (var j = 0; j < allPowerOutages.length; j++) {
                var outage = allPowerOutages[j];
                if (simulationTime <= outage.reportedTime && !outage.isReported) {
                    var timeUntilOutage = outage.reportedTime - simulationTime;

                    if (!nextEventExists) {
                        nextEventExists = true;
                        nextEventTime = timeUntilOutage;
                        nextEvent = {outage: outage};
                        nextEventDescription = "new outage";
                    }
                    else if (timeUntilOutage < nextEventTime) {
                        nextEvent = {outage: outage};
                        nextEventTime = timeUntilOutage;
                        nextEventDescription = "new outage";
                    }
                }
            }

            //check for outage fixed
            for (var i = 0; i < reportedPowerOutages.length; i++) {
                var outage = reportedPowerOutages[i];

                if (!outage.repairCrew && !outage.isFixed) {
                    outagesWithoutCrews.push(outage);
                }
                else if (outage.repairCrew) {
                    var timeUntilCompletion = outage.workStartTime + outage.repairEstimate - simulationTime;

                    if (!nextEventExists) {
                        nextEventExists = true;
                        nextEventTime = timeUntilCompletion;
                        nextEvent = {outage: outage};
                        nextEventDescription = "outage fixed";
                    }
                    else {
                        if (timeUntilCompletion < nextEventTime ) {
                            nextEvent = {outage: outage};
                            nextEventTime = timeUntilCompletion;
                            nextEventDescription = "outage fixed";
                        }
                    }
                }
            }

            //check for crew available to fix outage
            if (outagesWithoutCrews.length > 0) {
                var maxUrgency = 0;
                for (var i = 0; i < repairCrews.length; i++) {
                    var crew = repairCrews[i];

                    if (!crew.isCrewAvailable()) {
                        continue; //skip over crew if not available
                    }

                    for (var j = 0; j < outagesWithoutCrews.length; j++) {
                        var outage = outagesWithoutCrews[j];

                        if (stormIsActive && !specificBusinessFactor[outage.business].canRepairBeforeStormEnds) {
                            continue; //we can't work on this outage yet
                        }

                        if (!crew.hasTime(outage))  {
                            continue; //if we don't have enough time left in workday, then skip over this outage
                        }

                        var urgency = outage.powerOutageUrgency(crew);

                        if (urgency > maxUrgency) {
                            nextEvent = {crew: crew, outage: outage}
                            nextEventTime = 0;
                            nextEventDescription = "assign crew";
                            maxUrgency = urgency;
                        }
                    }
                }
            }


            //check if storm is ending
            if (stormIsActive) {
                var timeUntilStormEnds = stormEnds - simulationTime;
                if (timeUntilStormEnds < nextEventTime) {
                    nextEvent = {};
                    nextEventTime = timeUntilStormEnds;
                    nextEventDescription = "storm ends";
                }
            }
            //check for crews shifts starting up again, but only if we aren't done
            if (true) {
                for (var i = 0; i < repairCrews.length; i++) {
                    var crew = repairCrews[i];

                    if (crew.nextShiftStartTime == null) {
                        continue; //this crew hasn't been assigned something this shift yet, so they haven't started their shift yet;
                    }

                    var timeUntilCrewShift = crew.nextShiftStartTime - simulationTime;

                    if (timeUntilCrewShift <= nextEventTime) {
                        nextEvent = {crew: crew};
                        nextEventTime = timeUntilCrewShift;
                        nextEventDescription = "new shift";
                    }
                }
            }

            if (nextEvent == null) {
                return {done: true}
            }
            else {
                return {done: false, nextEvent: nextEvent, nextEventTime: nextEventTime, nextEventDescription: nextEventDescription}
            }
        }

        function saveResults(newEntry) {
            var total = 0;

            for (var i = 0; i < allPowerOutages.length; i++) {
                total += allPowerOutages[i].repairEstimate * allPowerOutages[i].peopleAffected;
            }

            recordedResults.push({ measuredEntry: newEntry, bestPossible: total});
        }

        function runSimulation() {
            while (simulationIsNotComplete) {
                var event = nextEvent();

                if (event.done) {
                    simulationIsNotComplete = false;
                    $("#outputLog").append("<p>Simulation complete!</p>");
                    $("#outputLog").append("<p>" + personHoursWithoutElectricity + " person hours were spent without electricity.</p>");

                    saveResults(personHoursWithoutElectricity);
                }
                else {
                    simulationTime += event.nextEventTime;
                    switch (event.nextEventDescription) {
                        case "assign crew": {
                            var crew = event.nextEvent.crew;
                            var powerOutage = event.nextEvent.outage;

                            crew.powerOutage = powerOutage;
                            crew.x = powerOutage.x;
                            crew.y = powerOutage.y;
                            powerOutage.repairCrew = crew;
                            powerOutage.workStartTime = simulationTime;

                            powerOutage.repairEstimate += (Math.abs(powerOutage.x - crew.x) + Math.abs(powerOutage.y - crew.y)) / speedLimit;

                            if (crew.nextShiftStartTime == null) {
                                crew.nextShiftStartTime = simulationTime + 24;
                            }

                            $("#outputLog").append("<p>Assigning crew number " + crew.crewNumber + " to outage " + powerOutage.powerOutageNumber + " at time " + simulationTime + "</p>");
                            break;
                        }
                        case "outage fixed": {
                            var powerOutage = event.nextEvent.outage;
                            var repairCrew = powerOutage.repairCrew;

                            powerOutage.isFixed = true;
                            repairCrew.powerOutage = null; //relieve crew of duty first, then unassign crew from outage
                            powerOutage.repairCrew = null;

                            var timeWithoutElectricity = simulationTime - powerOutage.reportedTime;
                            personHoursWithoutElectricity += powerOutage.peopleAffected * timeWithoutElectricity;

                            $("#outputLog").append("<p>Outage number " + powerOutage.powerOutageNumber + " has been repaired. Work crew " + repairCrew.crewNumber + " finished at time " + simulationTime + ".</p>");
                            break;
                        }
                        case "new outage": {
                            var powerOutage = event.nextEvent.outage;

                            powerOutage.isReported = true;
                            reportedPowerOutages.push(powerOutage);

                            $("#outputLog").append("<p>Outage number " + powerOutage.powerOutageNumber + " has been reported. Time is " + simulationTime + "</p>");
                            break;
                        }
                        case "storm ends": {
                            stormIsActive = false;

                            $("#outputLog").append("<p>Storm ends. Time is " + simulationTime + "</p>");
                            break;
                        }
                        case "new shift": {
                            var repairCrew = event.nextEvent.crew;

                            repairCrew.nextShiftStartTime = null;
                            repairCrew.x = repairCrew.homeX;
                            repairCrew.y = repairCrew.homeY;

                            $("#outputLog").append("<p>Repair crew " + repairCrew.crewNumber + " has started a new shift. Time is " + simulationTime + "</p>");
                            break;
                        }
                    }
                }
            }
        }

        //Function definition from https://stackoverflow.com/a/36481059
        // Standard Normal variate using Box-Muller transform.
        function randn_bm() {
            var u = 1 - Math.random(); // Subtraction to flip [0, 1) to (0, 1].
            var v = 1 - Math.random();
            return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
        }

        function randNormal(mean, stdDev) {
            return randn_bm() * stdDev + mean;
        }

        function randomBusiness() {
            var business = Math.floor(Math.random() * 37);

            //frequencies taken from analysis of problem's dataset
            if (business <= 0) {
                return "airport";
            }
            else if (business <= 5) {
                return "area";
            }
            else if (business <= 6) {
                return "bank";
            }
            else if (business <= 7) {
                return "cable";
            }
            else if (business <= 8) {
                return "cityHall";
            }
            else if (business <= 9) {
                return "civicCenter";
            }
            else if (business <= 10) {
                return "college";
            }
            else if (business <= 12) {
                return "elementarySchool";
            }
            else if (business <= 14) {
                return "fireDepartment";
            }
            else if (business <= 15) {
                return "highSchool";
            }
            else if (business <= 17) {
                return "hospital";
            }
            else if (business <= 20) {
                return "industry";
            }
            else if (business <= 21) {
                return "policeStation";
            }
            else if (business <= 22) {
                return "railroad";
            }
            else if (business <= 32) {
                return "residential";
            }
            else if (business <= 33) {
                return "restaurant";
            }
            else if (business <= 34) {
                return "shoppingMall";
            }
            else if (business <= 35) {
                return "stores";
            }
            else if (business <= 36) {
                return "trafficLights";
            }
        }

        function randomPeople() {
            var populationSize = Math.random();

            // 1/40 chance to have large number of people affected
            if (populationSize < .025) {
                return Math.floor(Math.random() * 10001 + 70000); // 70000 - 80000
            }
            // 3/8 chance to have a moderate number of people affected
            else if (populationSize < .4) {
                return Math.floor(Math.random() * 2701 + 300); // 300 - 3000
            }
            // 3/5 chance to have a small number of people affected
            else {
                return Math.floor(Math.random() * 281 + 21); //20 - 300
            }
        }

        function randomTime() {
            return Math.floor(Math.random() * 10 + 3) //3-12
        }

        function generateNewOutageSet() {
            var numberOfOutages = $("#numberOfOutages").val();
            allPowerOutages = [];

            powerOutageNumber = 1;
            for (var i = 0; i < numberOfOutages; i++) {
                var reportedTime = randNormal(7, 2);
                var business = randomBusiness();
                var xLocation = Math.floor(Math.random() * 81) - 20; // -20-60
                var yLocation = Math.floor(Math.random() * 91) - 35; // -35-55
                var peopleAffected = randomPeople();
                var repairTime = randomTime();

                allPowerOutages.push(new PowerOutageEvent(xLocation, yLocation, business, peopleAffected, repairTime, reportedTime));
            }
        }

        //Helper functions
        function zeroPadString(unformattedString, padLength) {
            var workingCopy = String(unformattedString);

            for (var i = workingCopy.length; i < padLength; i++) {
                workingCopy = "0" + workingCopy;
            }

            return workingCopy;
        }

        //event handlers
        $("#runIt").on("click", function() {
            var maxNumberOfSimulations = $("#simulations").val();

            recordedResults = [];

            for (var i = 0; i < maxNumberOfSimulations; i++) {
                resetSimulation();
            }

            var actualPersonHours = 0;
            var idealPersonHours = 0;

            recordedResults.map(function (result) {
                actualPersonHours += result.measuredEntry;
                idealPersonHours += result.bestPossible;
            });

            actualPersonHours /= maxNumberOfSimulations;
            idealPersonHours /= maxNumberOfSimulations;

            $("#outputLog").append("<p>All simulations complete. Average person hours waited: " + actualPersonHours + ". Ideal person hours waited: " + idealPersonHours + "</p>");

        });
    })
})();