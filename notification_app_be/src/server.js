require("dotenv").config({ path: "notification_app_be/.env", quiet: true });

const cors = require("cors");
const express = require("express");
const path = require("path");
const requestLogger = require("../../logging_middleware");
const { Log } = requestLogger;
const pool = require("./config/db");
const createExternalNotificationsRouter = require("./routes/external-notifications.routes");
const createNotificationsRouter = require("./routes/notifications.routes");
const createPriorityRouter = require("./routes/priority.routes");
const NotificationEvents = require("./services/notification-events");

const app = express();
const port = process.env.PORT || 3000;
const notificationEvents = new NotificationEvents();

app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(express.static(path.join(__dirname, "../../notification_app_fe/dist")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/notifications", createNotificationsRouter(pool, notificationEvents));
app.use("/api/external-notifications", createExternalNotificationsRouter());
app.use("/api/priority-inbox", createPriorityRouter());

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(
    path.join(__dirname, "../../notification_app_fe/dist/index.html")
  );
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  Log(
    "backend",
    "error",
    "handler",
    `${req.method} ${req.originalUrl} failed: ${error.message}`
  ).catch((logError) => {
    console.error("Remote logging failed:", logError.message);
  });
  res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`Notification API running on http://localhost:${port}`);
});
