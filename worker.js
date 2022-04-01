var fetch = require("node-fetch");
require("dotenv").config();
const errorlog = require("./util/logger");
var mysql = require("mysql");
var pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_ADMIN_USERNAME,
  password: process.env.DB_ADMIN_PASSWORD,
  database: process.env.DB_NAME,
});

let airportGroups = [
  {
    airports: "BER,CDG,MAD,FCO,LON,ATH",
    targets: "ATH",
    tripType: "RT",
    tripDates: { departureDate: "2021-9", arrivalDate: "2021-9" },
  },
];

processAirportGroups(airportGroups);

/**
 * Processes all of the given airport groups by calling the main function handleFlightData for each group
 *
 * @param {Array<Object>} airportGroups - Object containing all of the airport groups that we want to get data for
 */
async function processAirportGroups(airportGroups) {
  for (const airportGroup of airportGroups) {
    await handleFlightData(airportGroup);
  }
  pool.end();
}

/**
 * Main function, responsible for handling flight data (Calling the appropriate functions for collecting, parsing and storing)
 *
 * @param {Object} airportGroup - Object containing all of the airports alongside with options for setting airport targets and trip type
 */
async function handleFlightData(airportGroup) {
  try {
    let airports = await getAirports(airportGroup);

    let hasTargets = false;
    if (airportGroup.targets.length !== 0) {
      hasTargets = true;
    }

    let flightData = await getFlightData(airports, airportGroup.tripType, hasTargets, airportGroup.tripDates);

    await storeData(flightData);
  } catch (error) {
    errorlog.error(`Error Message : ${error}`);
  }
}

/**
 * Returns all of the airports as an array of objects
 *
 * @param {Object} airportGroup - Object containing all of the airports alongside with options for setting airport targets and trip type
 * @returns {Promise} airportList - Promise array contains all of the airports
 */
function getAirports(airportGroup) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, connection) {
      if (err) {
        throw err;
      }

      let q =
        airportGroup.airports === "ALL"
          ? "SELECT * FROM Airports"
          : "SELECT * FROM Airports WHERE FIND_IN_SET(IATA, ?)";

      connection.query(q, [airportGroup.airports], (error, result) => {
        connection.release();
        if (error) {
          errorlog.error(`Error Message : ${error}`);
        }

        let airportList = JSON.parse(JSON.stringify(result));

        airportList.forEach((airport) => {
          airport["target"] = false;

          if (airportGroup.targets.includes(airport.IATA)) {
            airport["target"] = true;
          }
        });

        return resolve(airportList);
      });
    });
  });
}

/**
 * Returns flight data for all of the given airports
 *
 * @param {Array<Object>} airports - Array of all of the airports
 * @param {String} tripType - String that identifies the trip type, either Round Trip (RT) or One Way (OW)
 * @param {String} hasTargets - String that identifies if there are airport targets set
 * @param {Object} tripDates - Object containing departure and arrival dates
 * @return {Promise} flightDataResult - Promise array contains all of the flight info
 * */
function getFlightData(airports, tripType, hasTargets, tripDates) {
  return new Promise(async (resolve) => {
    airports.sort((airport) => {
      if (airport.target !== true) {
        return -1;
      }
    });

    let airportsLength = airports.length;
    let flightDataResult = [];

    for (let i = 0; i < airportsLength; i++) {
      let isTarget = tripType === "RT" ? airports[0]["target"] : airports[i]["target"];

      if (airports.length == 0 || isTarget === true) {
        break;
      }

      for (let j = 0; j < airports.length; j++) {
        let index = tripType === "RT" ? 0 : i;

        if (j == index) {
          continue;
        }

        if (airports[j].target !== true && hasTargets === true) {
          continue;
        }

        let departure = tripType === "RT" ? airports[0]["IATA"] : airports[i]["IATA"];
        let arrival = airports[j]["IATA"];

        const URL = (href =
          "https://el.aegeanair.com/sys/lowfares/routelowfares/?DepartureAirport=" +
          departure +
          "&ArrivalAirport=" +
          arrival +
          "&TripType=" +
          tripType +
          "&DepartureDate=" +
          tripDates.departureDate +
          "&ReturnDate=" +
          tripDates.arrivalDate +
          "&Type=Fares");

        let flights = await getFlights(URL, tripType);

        if (tripType === "RT") {
          addFlights(arrival, departure, flights["Inbound"], tripType, flightDataResult);
        }
        addFlights(departure, arrival, flights["Outbound"], tripType, flightDataResult);
      }

      // Shift the airports array to reduce the number of iterations
      if (tripType == "RT") {
        airports.shift();
      }
    }

    if (flightDataResult.length == 0) {
      errorlog.error(`Error Message : Flight data is empty`);
    }
    resolve(flightDataResult);
  });
}

/**
 * Returns Outbound and Inbound raw flight data
 *
 * If the tirp type option is set to Round Trip (RT), each request collects flight data going both ways (e.g. ATH -> BER, BER -> ATH) * to reduce iterations
 * compared to a more bruteforce approach
 *
 * @param {String} url - The endpoint url
 * @param {String} tripType - String that identifies the trip type, either Round Trip (RT) or One Way (OW)
 * @returns {Object} flightList - Object containing Outbound and Inbound flight data
 */
async function getFlights(url, tripType) {
  let flightList = { Outbound: [], Inbound: [] };

  try {
    let response = await fetch(url);
    let flights = await response.json();

    flightList["Outbound"] = flights["Outbound"];

    if (tripType === "RT") {
      flightList["Inbound"] = flights["Inbound"];
    }
  } catch (error) {
    errorlog.error(`Error Message : ${error}`);
  } finally {
    return flightList;
  }
}

/**
 * Stores flight data in {Array} flightDataResult ready to be inserted into the database
 *
 * @param {String} departure - The departure airport's IATA
 * @param {String} arrival - The arrival airport's IATA
 * @param {Array<Object>} flights - Array of either Outbound or Inbound flight data
 * @param {String} tripType - String that identifies the trip type, either Round Trip (RT) or One Way (OW)
 * @param {Array} flightDataResult - Array that contains flight data ready to be inserted into the database
 */
function addFlights(departure, arrival, flights, tripType, flightDataResult) {
  if (flights.length != 0) {
    flights.forEach((flight) => {
      // Convert flightDate into MySQL format
      let flightDate = new Date(Number(/\d+/.exec(flight["Date"]))).toJSON().slice(0, 19).replace("T", " ");
      let recordDate = new Date().toJSON().slice(0, 19).replace("T", " "); // The current date

      flightDataResult.push([departure, arrival, flight["Price"], flightDate, recordDate, tripType]);
    });
  }
}

/**
 * Inserts flight data into the database
 *
 * @param {Array<Object>} flightData - Array containing all of the flight info
 */
function storeData(flightData) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, connection) {
      if (err) {
        errorlog.error(`Error Message : ${err}`);
      }

      let sql = "INSERT INTO Flights (departure, arrival, price, flight_date, record_date, trip_type) VALUES ?";

      connection.query(sql, [flightData], function (error) {
        if (error) {
          errorlog.error(`Error Message : ${error}`);
          reject(error);
        } else {
          connection.release();
          resolve("Task was successful");
        }
      });
    });
  });
}
