import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function serialize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  return value;
}

function sanitizeUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

export function createLogger(logFile, sensitiveValues = []) {
  const secrets = sensitiveValues
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  mkdirSync(path.dirname(logFile), { recursive: true });

  function redact(text) {
    return secrets.reduce(
      (result, secret) => result.replaceAll(secret, "[REDACTED]"),
      text
    );
  }

  function write(level, message, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(details === undefined ? {} : { details })
    };
    const line = redact(
      JSON.stringify(entry, (_key, value) => sanitizeUrl(serialize(value)))
    );

    console.log(line);
    appendFileSync(logFile, `${line}\n`, "utf8");
  }

  return {
    info: (message, details) => write("INFO", message, details),
    warn: (message, details) => write("WARN", message, details),
    error: (message, details) => write("ERROR", message, details)
  };
}
