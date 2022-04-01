/**
 * Logger configuration
 *
 * Used for error messages
 */
const winston = require("winston");

module.exports = winston.createLogger({
  transports: [
    new winston.transports.File({
      name: "error-file",
      level: "error",
      filename: "./logs/error.log",
      json: false,
      datePattern: "yyyy-MM-dd-",
      prepend: true,
    }),
  ],
});
