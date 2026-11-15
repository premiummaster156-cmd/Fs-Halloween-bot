"use strict";

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

function describeError(error) {
  if (error instanceof Error) return error.stack || error.message;
  return util.inspect(error, { depth: 5, breakLength: 120 });
}

function createRuntimeLogger(options = {}) {
  const logDirectory = path.resolve(
    options.logDirectory || process.env.BOT_LOG_DIR || path.join(process.cwd(), "logs")
  );
  const logFile = path.join(logDirectory, "bot-runtime.log");
  const maxFileBytes = Math.max(64 * 1024, Number(options.maxFileBytes) || 5 * 1024 * 1024);
  const backupFiles = Math.max(1, Math.min(10, Math.floor(Number(options.backupFiles) || 5)));
  const output = options.consoleObject || console;

  function rotateIfNeeded(incomingBytes) {
    fs.mkdirSync(logDirectory, { recursive: true });
    let currentSize = 0;
    try {
      currentSize = fs.statSync(logFile).size;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (currentSize + incomingBytes <= maxFileBytes) return;

    for (let index = backupFiles; index >= 1; index -= 1) {
      const source = index === 1 ? logFile : logFile + "." + (index - 1);
      const destination = logFile + "." + index;
      try {
        if (index === backupFiles) fs.rmSync(destination, { force: true });
        fs.renameSync(source, destination);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  function write(level, ...args) {
    let message;
    try {
      message = util.format(...args);
    } catch (formatError) {
      message = "[log formatting failed] " + describeError(formatError);
    }
    const line = new Date().toISOString() + " [" + String(level).toUpperCase() + "] " + message + "\n";
    try {
      const bytes = Buffer.byteLength(line, "utf8");
      rotateIfNeeded(bytes);
      fs.appendFileSync(logFile, line, { encoding: "utf8", mode: 0o600 });
    } catch (fileError) {
      try {
        output.error("[runtime-logger] Could not persist log file:", describeError(fileError));
      } catch (_) {}
    }

    const method = level === "fatal" || level === "error" ? "error"
      : level === "warn" ? "warn"
        : level === "debug" ? "debug" : "log";
    try {
      const writer = typeof output[method] === "function" ? output[method] : output.log;
      writer.call(output, ...args);
    } catch (_) {}
  }

  return {
    directory: logDirectory,
    file: logFile,
    write,
    error: (...args) => write("error", ...args),
    warn: (...args) => write("warn", ...args),
    info: (...args) => write("info", ...args),
    fatal: (...args) => write("fatal", ...args)
  };
}

function installConsoleFileLogging(options = {}) {
  const levels = ["log", "info", "warn", "error", "debug"];
  const originalConsole = {};
  for (const level of levels) {
    const writer = typeof console[level] === "function" ? console[level] : console.log;
    originalConsole[level] = writer.bind(console);
  }
  const logger = createRuntimeLogger({ ...options, consoleObject: originalConsole });

  for (const level of levels) {
    console[level] = (...args) => logger.write(level, ...args);
  }

  return logger;
}

function guardEmitter(emitter, options = {}) {
  if (!emitter || typeof emitter.on !== "function") return emitter;
  const logger = options.logger || createRuntimeLogger();
  const onError = typeof options.onError === "function" ? options.onError : null;
  const wrappedListeners = new WeakMap();
  const eventMethods = ["on", "addListener", "once", "prependListener", "prependOnceListener"];

  function report(event, error, args) {
    const eventName = String(event);
    logger.error("[event-guard] Listener failed for " + eventName + ":", describeError(error));
    if (onError) {
      try {
        const result = onError(event, error, args);
        if (result && typeof result.then === "function") {
          result.catch((callbackError) =>
            logger.error("[event-guard] Error recovery callback failed:", describeError(callbackError))
          );
        }
      } catch (callbackError) {
        logger.error("[event-guard] Error recovery callback threw:", describeError(callbackError));
      }
    }
  }

  function getWrapped(event, listener) {
    let eventMap = wrappedListeners.get(listener);
    if (!eventMap) {
      eventMap = new Map();
      wrappedListeners.set(listener, eventMap);
    }
    if (eventMap.has(event)) return eventMap.get(event);

    const wrapped = function (...args) {
      let result;
      try {
        result = listener.apply(this, args);
      } catch (error) {
        report(event, error, args);
        return undefined;
      }

      if (result && typeof result.then === "function") {
        result.catch((error) => report(event, error, args));
      }
      return result;
    };
    eventMap.set(event, wrapped);
    return wrapped;
  }

  for (const method of eventMethods) {
    if (typeof emitter[method] !== "function") continue;
    const original = emitter[method];
    emitter[method] = function (event, listener) {
      if (typeof listener !== "function") return original.call(this, event, listener);
      return original.call(this, event, getWrapped(event, listener));
    };
  }

  for (const method of ["off", "removeListener"]) {
    if (typeof emitter[method] !== "function") continue;
    const original = emitter[method];
    emitter[method] = function (event, listener) {
      if (typeof listener === "function") {
        const eventMap = wrappedListeners.get(listener);
        listener = eventMap?.get(event) || listener;
      }
      return original.call(this, event, listener);
    };
  }

  return emitter;
}

function installProcessErrorLogging(logger = createRuntimeLogger()) {
  process.on("warning", (warning) => {
    logger.warn("[process] Runtime warning:", describeError(warning));
  });

  // A handled rejection is usually an isolated background/task failure. Record it
  // without taking the entire bot offline; event listeners are separately guarded.
  process.on("unhandledRejection", (reason) => {
    logger.error("[process] Unhandled promise rejection:", describeError(reason));
  });

  // Do not swallow uncaught exceptions. Node.js is in an undefined state at this
  // point; this monitor records the error synchronously, then Node exits and the
  // hosting supervisor can restart a clean process.
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    logger.fatal("[process] Uncaught exception (" + origin + "):", describeError(error));
  });

  process.on("exit", (code) => {
    logger.info("[process] Exiting with code", code);
  });

  return logger;
}

function startMemoryMonitor(logger = createRuntimeLogger(), options = {}) {
  const intervalMs = Math.max(60 * 1000, Number(options.intervalMs) || 5 * 60 * 1000);
  const configuredThreshold = Number(options.warnAtMb ?? process.env.BOT_MEMORY_WARN_MB ?? 200);
  const warnAtMb = Number.isFinite(configuredThreshold) ? configuredThreshold : 200;
  let currentlyAboveThreshold = false;

  const timer = setInterval(() => {
    try {
      const usage = process.memoryUsage();
      const rssMb = usage.rss / (1024 * 1024);
      const heapUsedMb = usage.heapUsed / (1024 * 1024);
      const heapTotalMb = usage.heapTotal / (1024 * 1024);
      const externalMb = usage.external / (1024 * 1024);
      logger.info(
        "[memory] RSS " + rssMb.toFixed(1) + " MB; heap " +
        heapUsedMb.toFixed(1) + "/" + heapTotalMb.toFixed(1) +
        " MB; external " + externalMb.toFixed(1) + " MB."
      );

      if (warnAtMb > 0 && rssMb >= warnAtMb && !currentlyAboveThreshold) {
        currentlyAboveThreshold = true;
        logger.warn(
          "[memory] Process RSS has crossed the configured warning threshold of " +
          warnAtMb + " MB. Check the hosting memory metric and investigate possible growth."
        );
      } else if (warnAtMb > 0 && rssMb < warnAtMb * 0.9) {
        currentlyAboveThreshold = false;
      }
    } catch (error) {
      logger.error("[memory] Could not collect process memory statistics:", error);
    }
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  createRuntimeLogger,
  installConsoleFileLogging,
  guardEmitter,
  installProcessErrorLogging,
  startMemoryMonitor,
  describeError
};
