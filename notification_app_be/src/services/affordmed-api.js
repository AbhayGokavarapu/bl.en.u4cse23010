const DEFAULT_BASE_URL = "http://20.207.122.201/evaluation-service";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    const error = new Error(`${name} is required`);
    error.statusCode = 500;
    throw error;
  }

  return value;
}

async function parseJsonResponse(response) {
  const body = await response.text();

  try {
    return JSON.parse(body);
  } catch {
    return { message: body };
  }
}

function appendNotificationQuery(url, options = {}) {
  const limit = normalizeApiLimit(options.limit);
  const page = Number.parseInt(options.page, 10);

  url.searchParams.set("limit", String(limit));

  if (Number.isInteger(page) && page > 0) {
    url.searchParams.set("page", String(page));
  }

  if (options.notificationType) {
    url.searchParams.set("notification_type", options.notificationType);
  }
}

function normalizeApiLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return 10;
  }

  return Math.min(Math.max(parsed, 5), 10);
}

function normalizeRequestedLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(parsed, 100);
}

async function authenticate() {
  if (process.env.AFFORDMED_ACCESS_TOKEN) {
    return process.env.AFFORDMED_ACCESS_TOKEN;
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
    const error = new Error(data.message || "Failed to authenticate");
    error.statusCode = response.status;
    throw error;
  }

  return data.access_token;
}

async function fetchNotificationPage(options = {}) {
  const baseUrl = process.env.AFFORDMED_BASE_URL || DEFAULT_BASE_URL;
  const token = await authenticate();
  const url = new URL(`${baseUrl}/notifications`);
  appendNotificationQuery(url, options);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const details = data.errors ? JSON.stringify(data.errors) : "";
    const error = new Error(
      data.message || `Failed to fetch notifications ${details}`.trim()
    );
    error.statusCode = response.status;
    throw error;
  }

  return data.notifications || [];
}

async function fetchNotifications(options = {}) {
  const requestedLimit = normalizeRequestedLimit(options.limit);

  if (requestedLimit <= 10) {
    return fetchNotificationPage({
      ...options,
      limit: requestedLimit,
    });
  }

  const startPage = Number.parseInt(options.page, 10) || 1;
  const collected = [];
  const pagesToFetch = Math.ceil(requestedLimit / 10);

  for (let index = 0; index < pagesToFetch; index += 1) {
    const notifications = await fetchNotificationPage({
      ...options,
      limit: 10,
      page: startPage + index,
    });

    collected.push(...notifications);

    if (notifications.length < 10 || collected.length >= requestedLimit) {
      break;
    }
  }

  return collected.slice(0, requestedLimit);
}

module.exports = {
  authenticate,
  fetchNotifications,
};
