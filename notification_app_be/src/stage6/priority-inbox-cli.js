require("dotenv").config({ path: "notification_app_be/.env", quiet: true });

const { fetchNotifications } = require("../services/affordmed-api");
const {
  findTopPriorityNotifications,
  getPriorityScore,
} = require("../services/priority-inbox");

async function main() {
  const limit = Number.parseInt(process.argv[2] || "10", 10);
  const notifications = await fetchNotifications();
  const topNotifications = findTopPriorityNotifications(notifications, limit);
  const output = topNotifications.map((notification, index) => ({
    rank: index + 1,
    id: notification.ID,
    type: notification.Type,
    message: notification.Message,
    timestamp: notification.Timestamp,
    priorityWeight: getPriorityScore(notification).typeWeight,
  }));

  console.table(output);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
