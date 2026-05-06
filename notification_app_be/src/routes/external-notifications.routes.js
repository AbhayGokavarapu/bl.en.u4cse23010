const express = require("express");
const { fetchNotifications } = require("../services/affordmed-api");

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(Math.max(parsed, 5), 10);
}

function parsePage(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function normalizeNotificationType(value) {
  if (!value || value === "All") {
    return undefined;
  }

  return value;
}

function createExternalNotificationsRouter() {
  const router = express.Router();

  router.get("/", async (req, res, next) => {
    try {
      const limit = parseLimit(req.query.limit);
      const page = parsePage(req.query.page);
      const notificationType = normalizeNotificationType(
        req.query.notification_type
      );
      const notifications = await fetchNotifications({
        limit,
        page,
        notificationType,
      });

      return res.json({
        limit,
        page,
        notificationType: notificationType || "All",
        notifications,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createExternalNotificationsRouter;
