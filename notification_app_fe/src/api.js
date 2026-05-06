export const NOTIFICATION_TYPES = ["All", "Event", "Result", "Placement"];

async function getJson(path) {
  const response = await fetch(path);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export function fetchNotifications({ limit, page, notificationType }) {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });

  if (notificationType && notificationType !== "All") {
    params.set("notification_type", notificationType);
  }

  return getJson(`/api/external-notifications?${params.toString()}`);
}

export function fetchPriorityNotifications({
  limit,
  notificationType,
  scanLimit,
}) {
  const params = new URLSearchParams({
    limit: String(limit),
    scanLimit: String(scanLimit),
  });

  if (notificationType && notificationType !== "All") {
    params.set("notification_type", notificationType);
  }

  return getJson(`/api/priority-inbox/top?${params.toString()}`);
}

