const express = require("express");
const {
  countUnreadByStudent,
  createNotification,
  findByStudent,
  findPlacementStudentsSince,
  findUnreadByStudent,
  markAllReadByStudent,
  markNotificationRead,
} = require("../repositories/notifications.repository");

function parsePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} must be positive`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function createNotificationsRouter(pool, notificationEvents) {
  const router = express.Router();

  router.get("/students/:studentId", async (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");
      const data = await findByStudent(pool, studentId, {
        limit: req.query.limit,
        offset: req.query.offset,
        status: req.query.status,
        type: req.query.type,
      });

      return res.json({
        studentID: studentId,
        ...data,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/students/:studentId/unread", async (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");

      const data = await findUnreadByStudent(pool, studentId, {
        limit: req.query.limit,
        offset: req.query.offset,
      });

      return res.json({
        studentID: studentId,
        ...data,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/students/:studentId/unread-count", async (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");
      const unreadCount = await countUnreadByStudent(pool, studentId);

      return res.json({
        studentID: studentId,
        unreadCount,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch(
    "/students/:studentId/notifications/:notificationId/read",
    async (req, res, next) => {
      try {
        const studentId = parsePositiveInteger(
          req.params.studentId,
          "studentId"
        );
        const notificationId = parsePositiveInteger(
          req.params.notificationId,
          "notificationId"
        );
        const notification = await markNotificationRead(
          pool,
          studentId,
          notificationId
        );

        if (!notification) {
          return res.status(404).json({ message: "Notification not found" });
        }

        return res.json({ notification });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.patch("/students/:studentId/read-all", async (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");
      const updatedCount = await markAllReadByStudent(pool, studentId);

      return res.json({
        studentID: studentId,
        updatedCount,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/students/:studentId/notifications", async (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");
      const notification = await createNotification(pool, {
        studentID: studentId,
        notificationType: req.body.notificationType,
        title: req.body.title,
        message: req.body.message,
      });

      notificationEvents.publish(studentId, notification);

      return res.status(201).json({ notification });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/students/:studentId/stream", (req, res, next) => {
    try {
      const studentId = parsePositiveInteger(req.params.studentId, "studentId");

      notificationEvents.addClient(studentId, req, res);
    } catch (error) {
      next(error);
    }
  });

  router.get("/placement/students", async (req, res, next) => {
    try {
      const data = await findPlacementStudentsSince(pool, req.query.days || 7);

      return res.json(data);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createNotificationsRouter;
