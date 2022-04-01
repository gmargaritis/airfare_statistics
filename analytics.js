require("dotenv").config();
const errorlog = require("./util/logger");
var mysql = require("mysql");
const { Console } = require("winston/lib/winston/transports");
var pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_ADMIN_USERNAME,
  password: process.env.DB_ADMIN_PASSWORD,
  database: process.env.DB_NAME,
});

/**
 * Main function that is responsible for conducting the statistical analysis
 *
 * @param {String} departure - String describing the airport of departure
 * @param {String} arrival - String describing the airport of arrival
 * @param {String} trip_type - String that indicates the trip type
 * @param {String} request_interval - String that identifies the interval of the requests
 * @returns {Array} results - Array containing the results of the statistical analysis
 */
async function getStatistics(departure, arrival, trip_type, request_interval) {
  let stats = await getData(departure, arrival, trip_type, request_interval);

  let results = getResults(stats);

  return results;
}

function getData(departure, arrival, trip_type, request_interval) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, connection) {
      if (err) {
        throw err;
      }

      let airportInfo = [departure, arrival, trip_type];
      let q =
        "SELECT departure, arrival, AVG(price) as average, MAX(price) as max, MIN(price) as min, flight_date FROM Flights WHERE departure = ? AND arrival = ? AND trip_type = ? AND flight_date > '2021-08-31' AND record_date < '2021-09-07' group by flight_date order by flight_date";

      if (request_interval.includes("three")) {
        q =
          "SELECT departure, arrival, AVG(price) as average, MAX(price) as max, MIN(price) as min, record_date FROM Flights WHERE departure = ? AND arrival = ? AND trip_type = ? AND flight_date LIKE '2021-09-13' AND record_date >= '2021-09-07' group by record_date order by record_date";
      }

      connection.query(q, airportInfo, (error, result) => {
        connection.release();
        if (error) {
          errorlog.error(`Error Message : ${error}`);
        }

        let data = JSON.parse(JSON.stringify(result));

        return resolve(data);
      });
    });
  });
}

/**
 * Conducts statistical analysis
 *
 * @param {Array<Object>} stats - Array containing all of the information about a flight route
 * @returns {Array} results - Array containing the results of the statistical analysis
 */
function getResults(stats) {
  let avgPrices = prepPrices(stats, "average");

  let mean = calcMean(avgPrices);
  let median = calcMedian(avgPrices);
  let variance = calcVariance(avgPrices, mean);
  let range = calcRange(avgPrices);
  let standardDeviation = calcStandardDeviation(variance);

  let results = [
    {
      mean_price: mean,
      median_price: median,
      variance: variance,
      range: range,
      standard_deviation: standardDeviation,
    },
  ];

  return results;
}

/**
 * Calculates the mean price
 *
 * @param {Array} prices - Array containing all of the prices of a trip
 * @return {Integer} - Integer representing the mean price
 */
function calcMean(prices) {
  let mean =
    prices.reduce((acc, curr) => {
      return acc + curr;
    }, 0) / prices.length;

  return mean;
}

/**
 * Calculates the median
 *
 * @param {Array} prices - Array containing all of the prices of a trip
 * @return {Integer} - An integer representing the median price
 */
function calcMedian(prices) {
  const sorted = prices.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

/**
 * Calculates the variance of a set of prices
 *
 * @param {Array} prices - Array containing all of the prices of a trip
 * @param {Integer} mean - Integer tha represents the mean value
 * @return {Integer} - Integer representing the variance
 */
function calcVariance(prices, mean) {
  prices = prices.map((k) => {
    return (k - mean) ** 2;
  });

  let sum = prices.reduce((acc, curr) => acc + curr, 0);
  let variance = sum / prices.length - 1;

  return variance;
}

/**
 * Calculates the range of prices
 *
 * @param {Array} prices - Array containing all of the prices of a trip
 * @return {Integer} - Integer that represents the range of prices
 */
function calcRange(prices) {
  prices.sort(function (a, b) {
    return a - b;
  });

  let range = prices[prices.length - 1] - prices[0];
  return range;
}

/**
 * Calculates the standard devation
 *
 * @param {Integer} variance - Integer that represents the variance
 * @return {Integer} - An integer representing the standard deviation
 */
function calcStandardDeviation(variance) {
  return Math.sqrt(variance);
}

function prepPrices(stats, type) {
  let prices = [];

  stats.forEach((stat) => {
    prices.push(stat[type]);
  });

  return prices;
}

module.exports = {
  getStatistics,
};
