const express = require("express");
const { getStatistics } = require("./analytics.js");
const app = express();
const PORT = process.env.PORT || 3000;

/**
 *
 * Define all of the experiments with the following structure
 *
 * */
let experiments = [
  {
    experiment: {
      description: "This experiment was conducted to ...",
      source: "AEGEAN",
      airports: "BER,CDG,MAD,FCO,LON,ATH",
      targets: "ATH",
      trip_type: "RT",
      request_interval: "once per day",
      start_date: "01-09-2021",
      end_date: "30-09-2021",
      findings: {},
    },
  },
];

handleResults();

app.get("/results", async (req, res) => {
  res.send(experiments);
});

app.get("/results/:experiment_name", (req, res) => {
  let experimentName = req.params.experiment_name;
  let experiment = getExperiment(experimentName);

  res.send(experiment);
});

/**
 * Prepares all of the experiment data
 * that will be sent as a response by the server
 */
function handleResults() {
  experiments.forEach((experiment) => {
    prepareRoutes(experiment);

    prepareStatistics(experiment);
  });
}

/**
 * Given an experiment name, it returns the experiment in question as an object
 *
 * @param {String} experimentName - The name of the experiment
 * @return {Object} result - Object containing all of the experiment data
 */
function getExperiment(experimentName) {
  let result = {};
  experiments.forEach((experiment) => {
    for (var key in experiment) {
      if (key === experimentName) {
        result[key] = experiment[key];
      }
    }
  });
  return result;
}

/**
 * Programmatically generates all of the possible routes of an experiment
 *
 * @param {Object} experiment - Object containing all of the experiment data
 */
function prepareRoutes(experiment) {
  let routes = [];
  for (const stat in experiment) {
    let hasTargets = false;
    if (experiment[stat].targets.length !== 0) {
      hasTargets = true;
    }

    let airports = experiment[stat].airports.split(",");
    let airportTargets = [];

    airports.forEach((airport) => {
      let target = false;

      if (experiment[stat].targets.includes(airport)) {
        target = true;
      }

      airportTargets.push({ airport: airport, target: target });
    });

    airportTargets.sort((airport) => {
      if (airport.target !== true) {
        return -1;
      }
    });

    for (let i = 0; i < airportTargets.length; i++) {
      if (airportTargets[i].target === true) {
        break;
      }

      for (let j = 0; j < airportTargets.length; j++) {
        if (j == i) {
          continue;
        }

        if (airportTargets[j].target !== true && hasTargets === true) {
          continue;
        }

        routes.push({
          departure: airportTargets[i].airport,
          arrival: airportTargets[j].airport,
        });
      }
    }
    experiment[stat]["routes"] = routes;
  }
}

/**
 * Fetches all of the available statistics for a given experiment
 *
 * @param {Object} experiment - Object containing all of the experiment data
 */
function prepareStatistics(experiment) {
  for (const attr in experiment) {
    experiment[attr]["routes"].forEach(async (route) => {
      let statistics = await getStatistics(
        route.departure,
        route.arrival,
        experiment[attr].trip_type,
        experiment[attr].request_interval
      );

      route["results"] = statistics;
    });
  }
}

app.listen(PORT);
