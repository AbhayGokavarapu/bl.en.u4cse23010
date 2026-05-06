const DEFAULT_BASE_URL = "http://20.207.122.201/evaluation-service";

const VALID_STACKS = new Set(["backend", "frontend"]);
const VALID_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);
const VALID_PACKAGES = new Set([
  "api",
  "auth",
  "cache",
  "component",
  "config",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "hook",
  "middleware",
  "page",
  "repository",
  "route",
  "service",
  "state",
  "style",
  "utils",
]);

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for logging middleware`);
  }

  return value;
}

function validateLogInput(stack, level, packageName, message) {
  if (!VALID_STACKS.has(stack)) {
    throw new Error("stack must be backend or frontend");
  }

  if (!VALID_LEVELS.has(level)) {
    throw new Error("level must be debug, info, warn, error, or fatal");
  }

  if (!VALID_PACKAGES.has(packageName)) {
    throw new Error("package is not allowed");
  }

  if (!message || typeof message !== "string") {
    throw new Error("message must be a non-empty string");
  }
}

async function parseJsonResponse(response) {
  const body = await response.text();

  try {
    return JSON.parse(body);
  } catch {
    return { message: body };
  }
}

async function getAccessToken() {
  if (process.env.AFFORDMED_ACCESS_TOKEN) {
    return process.env.AFFORDMED_ACCESS_TOKEN;
  }

  const now = Date.now();

  if (cachedToken && cachedTokenExpiresAt > now + 30000) {
    return cachedToken;
  }

  const baseUrl = process.env.AFFORDMED_BASE_URL || DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: requireEnv("AFFORDMED_EMAIL"),
      name: requireEnv("AFFORDMED_NAME"),
      rollNo: requireEnv("AFFORDMED_ROLL_NO"),
      accessCode: requireEnv("AFFORDMED_ACCESS_CODE"),
      clientID: requireEnv("AFFORDMED_CLIENT_ID"),
      clientSecret: requireEnv("AFFORDMED_CLIENT_SECRET"),
    }),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.message || "Failed to authenticate logger");
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = data.expires_in ? data.expires_in * 1000 : now + 900000;

  return cachedToken;
}

async function Log(stack, level, packageName, message) {
  validateLogInput(stack, level, packageName, message);

  const baseUrl = process.env.AFFORDMED_BASE_URL || DEFAULT_BASE_URL;
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl}/logs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      stack,
      level,
      package: packageName,
      message,
    }),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data.message || "Failed to create log");
  }

  return data;
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    const logLine = [
      new Date().toISOString(),
      req.method,
      req.originalUrl,
      res.statusCode,
      `${duration}ms`,
    ].join(" ");

    console.log(logLine);
    Log(
      "backend",
      res.statusCode >= 500 ? "error" : "info",
      "middleware",
      `${req.method} ${req.originalUrl} completed with ${res.statusCode} in ${duration}ms`
    ).catch((error) => {
      console.error("Remote logging failed:", error.message);
    });
  });

  next();
}

requestLogger.Log = Log;

module.exports = requestLogger;
