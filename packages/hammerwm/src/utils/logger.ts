import pino from "pino";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination({
    dest: `${process.env.HOME}/Library/Logs/hammerwm.log`,
    sync: false,
  }),
);
