const express = require("express");
const { fetchNotifications } = require("../services/affordmed-api");
const {
  findTopPriorityNotifications,
} = require("../services/priority-inbox");

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(parsed, 50);
}

function createPriorityRouter() {
  const router = express.Router();

  router.get("/top", async (req, res, next) => {
    try {
      const limit = parseLimit(req.query.limit);
      const notifications = await fetchNotifications({
        limit: req.query.scanLimit || 100,
        page: req.query.page || 1,
        notificationType: req.query.notification_type,
      });
      const priorityNotifications = findTopPriorityNotifications(
        notifications,
        limit
      );

      return res.json({
        limit,
        totalFetched: notifications.length,
        priorityNotifications,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createPriorityRouter;
