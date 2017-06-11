'use strict';
(function() {
    $(document).ready(function() {

        var reportedPowerOutages = [];
        var repairCrews = [];
        var simulationTime = 0; //simulation times measured in hours
        var stormIsActive = true;
        var stormEnds = 6; //storm ends at 6
        var simulationIsNotComplete = true;

        var speedLimit = 60;
        var distanceFactor = 1;
        var peopleFactor = 1;
        var businessFactor = {
            cable: {weight: 1, canRepairBeforeStormEnds: false},
            residential: {weight: 1, canRepairBeforeStormEnds: false},
            hospital: {weight: 1, canRepairBeforeStormEnds: true},
            railroad: {weight: 1, canRepairBeforeStormEnds: true},
            area: {weight: 1, canRepairBeforeStormEnds: false},
            cityHall: {weight: 1, canRepairBeforeStormEnds: false},
            fireDepartment: {weight: 1, canRepairBeforeStormEnds: false},
            industry: {weight: 1, canRepairBeforeStormEnds: false},
            highSchool: {weight: 1, canRepairBeforeStormEnds: false},
            elementarySchool: {weight: 1, canRepairBeforeStormEnds: false},
            restaurant: {weight: 1, canRepairBeforeStormEnds: false},
            policeStation: {weight: 1, canRepairBeforeStormEnds: false},
            college: {weight: 1, canRepairBeforeStormEnds: false},
            stores: {weight: 1, canRepairBeforeStormEnds: false},
            trafficLights: {weight: 1, canRepairBeforeStormEnds: false},
            bank: {weight: 1, canRepairBeforeStormEnds: false},
            civicCenter: {weight: 1, canRepairBeforeStormEnds: false},
            airport: {weight: 1, canRepairBeforeStormEnds: false}
        }
        var repairTimeFactor = 1;
        var waitTimeFactor = 1;

        var numberOfRepairCrewsAtEachLocation = 1; //one crew has to stay at home base at all times

        var allPowerOutages = [];

        //Simulation functions
        function powerOutageUrgency(potentialRepairCrew) {
            var MAXDISTANCE = 230;

            //taxicab geometry
            var distance = (MAXDISTANCE - (Math.abs(this.x - potentialRepairCrew.x) + Math.abs(this.y - potentialRepairCrew.y))) * distanceFactor / speedLimit;
            var people = this.peopleAffected * peopleFactor;
            var business = businessFactor[this.business].weight;
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
            this.workStartTime = -1;
            this.isFixed = false;
            this.powerOutageUrgency = powerOutageUrgency;
            this.powerOutageNumber = powerOutageNumber;

            powerOutageNumber++;
        }

        function isCrewAvailable() {
            return !this.powerOutage || this.powerOutage.repairEstimate === 0;
        }

        var crewNumber = 1;
        function RepairCrew(x, y, powerOutage) {
            this.x = x;
            this.y = y;
            this.powerOutage = powerOutage;
            this.isCrewAvailable = isCrewAvailable;
            this.workHoursRemaining = 16;
            this.crewNumber = crewNumber;

            crewNumber++;
        }

        function resetSimulation() {
            reportedPowerOutages = [];
            repairCrews = [];
            allPowerOutages = [];
            simulationIsNotComplete = true;
            stormIsActive = true;

            crewNumber = 1;
            powerOutageNumber = 1;

            $("#outputLog").html("<p>Starting simulation...</p>");
            for (var i = 0; i < numberOfRepairCrewsAtEachLocation; i++) {
                repairCrews.push(new RepairCrew(0, 0, null, null));
                repairCrews.push(new RepairCrew(40, 40, null, null));
            }

            allPowerOutages.push(new PowerOutageEvent(-25, -25, "cable", 100, 2.5, 4.5));
            allPowerOutages.push(new PowerOutageEvent(25, 25, "railroad", 100, 2.5, 6.5));

            simulationTime = 0;

            speedLimit = $("#speedLimit").val();
            distanceFactor = $("#distanceFactor").val();
            peopleFactor = $("#peopleFactor").val();
            repairTimeFactor = $("#repairTimeFactor").val();
            waitTimeFactor = $("#waitTimeFactor").val();

            runSimulation();
        }

        function nextEvent() {
            var nextEventTime = -1;
            var nextEventExists = false;
            var outagesWithoutCrews = [];
            var nextEvent = null;
            var nextEventDescription = "";

            //check for new outage
            for (var j = 0; j < allPowerOutages.length; j++) {
                var outage = allPowerOutages[j];
                if (simulationTime < outage.reportedTime) {
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

                        if (stormIsActive && ![outage.business].canRepairBeforeStormEnds) {
                            continue; //we can't work on this outage yet
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

            if (nextEvent == null) {
                return {done: true}
            }
            else {
                return {done: false, nextEvent: nextEvent, nextEventTime: nextEventTime, nextEventDescription: nextEventDescription}
            }
        }

        function runSimulation() {
            while (simulationIsNotComplete) {
                var event = nextEvent();

                if (event.done) {
                    simulationIsNotComplete = false;
                    $("#outputLog").append("<p>Simulation complete!</p>");
                }
                else {
                    simulationTime += event.nextEventTime;
                    switch (event.nextEventDescription) {
                        case "assign crew": {
                            var crew = event.nextEvent.crew;
                            var powerOutage = event.nextEvent.outage;

                            crew.powerOutage = powerOutage;
                            powerOutage.repairCrew = crew;
                            powerOutage.workStartTime = simulationTime;

                            powerOutage.repairEstimate += (Math.abs(powerOutage.x - crew.x) + Math.abs(powerOutage.y - crew.y)) / speedLimit;

                            $("#outputLog").append("<p>Assigning crew number " + crew.crewNumber + " to outage " + powerOutage.powerOutageNumber + " at time " + simulationTime + "</p>");
                            break;
                        }
                        case "outage fixed": {
                            var powerOutage = event.nextEvent.outage;
                            var repairCrew = powerOutage.repairCrew;

                            powerOutage.isFixed = true;
                            repairCrew.powerOutage = null; //relieve crew of duty first, then unassign crew from outage
                            powerOutage.repairCrew = null;

                            $("#outputLog").append("<p>Outage number " + powerOutage.powerOutageNumber + " has been repaired. Work crew " + repairCrew.crewNumber + " finished at time " + simulationTime + ".</p>");
                            break;
                        }
                        case "new outage": {
                            var powerOutage = event.nextEvent.outage;

                            reportedPowerOutages.push(powerOutage);

                            $("#outputLog").append("<p>Outage number " + powerOutage.powerOutageNumber + " has been reported. Time is " + simulationTime + "</p>");
                            break;
                        }
                        case "storm ends": {
                            stormIsActive = false;

                            $("#outputLog").append("<p>Storm ends. Time is " + simulationTime + "</p>");
                            break;
                        }
                    }
                }
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
            resetSimulation();
        });

    })
})();