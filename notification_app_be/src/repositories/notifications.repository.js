const DEFAULT_UNREAD_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_UNREAD_LIMIT = 100;
const MAX_LIST_LIMIT = 100;
const VALID_NOTIFICATION_TYPES = new Set(["Event", "Result", "Placement"]);

const notificationFields = `
  id,
  "studentID",
  "notificationType",
  title,
  message,
  "isRead",
  "readAt",
  "createdAt"
`;

const unreadNotificationsQuery = `
  SELECT ${notificationFields}
  FROM notifications
  WHERE "studentID" = $1
    AND "isRead" = false
  ORDER BY "createdAt" ASC
  LIMIT $2
  OFFSET $3;
`;

const unreadCountQuery = `
  SELECT COUNT(*)::int AS count
  FROM notifications
  WHERE "studentID" = $1
    AND "isRead" = false;
`;

const recentPlacementStudentsQuery = `
  SELECT DISTINCT "studentID"
  FROM notifications
  WHERE "notificationType" = 'Placement'::notification_type
    AND "createdAt" >= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
  ORDER BY "studentID" ASC;
`;

function toPositiveInteger(value, fallback, maxValue) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, maxValue);
}

function toNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function assertNotificationType(notificationType) {
  if (!VALID_NOTIFICATION_TYPES.has(notificationType)) {
    const error = new Error("notificationType must be Event, Result, or Placement");
    error.statusCode = 400;
    throw error;
  }
}

async function findByStudent(pool, studentId, options = {}) {
  const limit = toPositiveInteger(
    options.limit,
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT
  );
  const offset = toNonNegativeInteger(options.offset, 0);
  const values = [studentId];
  const conditions = ['"studentID" = $1'];

  if (options.status === "read") {
    conditions.push('"isRead" = true');
  } else if (options.status === "unread") {
    conditions.push('"isRead" = false');
  }

  if (options.type) {
    assertNotificationType(options.type);
    values.push(options.type);
    conditions.push(`"notificationType" = $${values.length}::notification_type`);
  }

  values.push(limit);
  const limitPosition = values.length;
  values.push(offset);
  const offsetPosition = values.length;

  const result = await pool.query(
    `
      SELECT ${notificationFields}
      FROM notifications
      WHERE ${conditions.join(" AND ")}
      ORDER BY "createdAt" DESC
      LIMIT $${limitPosition}
      OFFSET $${offsetPosition};
    `,
    values
  );

  return {
    limit,
    offset,
    notifications: result.rows,
  };
}

async function findUnreadByStudent(pool, studentId, options = {}) {
  const limit = toPositiveInteger(
    options.limit,
    DEFAULT_UNREAD_LIMIT,
    MAX_UNREAD_LIMIT
  );
  const offset = toNonNegativeInteger(options.offset, 0);
  const result = await pool.query(unreadNotificationsQuery, [
    studentId,
    limit,
    offset,
  ]);

  return {
    limit,
    offset,
    notifications: result.rows,
  };
}

async function countUnreadByStudent(pool, studentId) {
  const result = await pool.query(unreadCountQuery, [studentId]);

  return result.rows[0].count;
}

async function markNotificationRead(pool, studentId, notificationId) {
  const result = await pool.query(
    `
      UPDATE notifications
      SET "isRead" = true,
          "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
      WHERE id = $1
        AND "studentID" = $2
      RETURNING ${notificationFields};
    `,
    [notificationId, studentId]
  );

  return result.rows[0] || null;
}

async function markAllReadByStudent(pool, studentId) {
  const result = await pool.query(
    `
      UPDATE notifications
      SET "isRead" = true,
          "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
      WHERE "studentID" = $1
        AND "isRead" = false
      RETURNING id;
    `,
    [studentId]
  );

  return result.rowCount;
}

async function createNotification(pool, notification) {
  assertNotificationType(notification.notificationType);

  const result = await pool.query(
    `
      INSERT INTO notifications (
        "studentID",
        "notificationType",
        title,
        message
      )
      VALUES ($1, $2::notification_type, $3, $4)
      RETURNING ${notificationFields};
    `,
    [
      notification.studentID,
      notification.notificationType,
      notification.title || null,
      notification.message || null,
    ]
  );

  return result.rows[0];
}

async function findPlacementStudentsSince(pool, days = 7) {
  const daysBack = toPositiveInteger(days, 7, 365);
  const result = await pool.query(recentPlacementStudentsQuery, [daysBack]);

  return {
    days: daysBack,
    students: result.rows.map((row) => row.studentID),
  };
}

module.exports = {
  countUnreadByStudent,
  createNotification,
  findByStudent,
  findUnreadByStudent,
  findPlacementStudentsSince,
  markAllReadByStudent,
  markNotificationRead,
  recentPlacementStudentsQuery,
  unreadNotificationsQuery,
};
