## Stage 1

The notification system should let a logged-in student see notifications, filter them, check unread count, mark notifications as read, and receive live updates.

Common headers:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Main API design:

```http
GET   /api/notifications/students/{studentID}?status=unread&type=Event&limit=20&offset=0
GET   /api/notifications/students/{studentID}/unread-count
PATCH /api/notifications/students/{studentID}/notifications/{notificationID}/read
PATCH /api/notifications/students/{studentID}/read-all
POST  /api/notifications/students/{studentID}/notifications
GET   /api/notifications/students/{studentID}/stream
```

Example notification response:

```json
{
  "id": 501,
  "studentID": 1042,
  "notificationType": "Placement",
  "title": "Placement Drive",
  "message": "New placement drive announced",
  "isRead": false,
  "createdAt": "2026-05-06T09:30:00.000Z"
}
```

For real-time notifications, I used Server-Sent Events because the server mainly has to push updates to the frontend.

## Stage 2

I would use PostgreSQL. Notifications need reliable writes, filtering by student, read/unread updates, ordering by time, and transactions. PostgreSQL also gives good indexing, enums, and partitioning support when data grows.

Schema:

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  "studentID" BIGINT NOT NULL,
  "notificationType" notification_type NOT NULL,
  title TEXT,
  message TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_student_created_at
ON notifications ("studentID", "createdAt" DESC);

CREATE INDEX idx_notifications_unread_student_created_at
ON notifications ("studentID", "createdAt")
WHERE "isRead" = false;
```

Useful queries:

```sql
SELECT *
FROM notifications
WHERE "studentID" = $1
ORDER BY "createdAt" DESC
LIMIT $2 OFFSET $3;

UPDATE notifications
SET "isRead" = true,
    "readAt" = CURRENT_TIMESTAMP
WHERE id = $1 AND "studentID" = $2;
```

As data grows, the main issues will be slow scans, large sorts, expensive unread counts, and heavy fan-out writes. I would solve this with proper composite indexes, pagination, archiving old notifications, caching hot unread counts, and background workers for bulk notification sending.

## Stage 3

Original query:

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

The query is logically fine if each row belongs to one student. It is slow because the table has 5,000,000 notifications. Without an index, the DB may scan the full table and then sort the matched rows.

Cost without index:

```text
O(N + K log K)
N = total notifications
K = unread notifications for the student
```

Better index:

```sql
CREATE INDEX idx_notifications_student_read_created_at
ON notifications (studentID, isRead, createdAt);
```

In PostgreSQL, a partial index is even better:

```sql
CREATE INDEX idx_notifications_unread_student_created_at
ON notifications (studentID, createdAt)
WHERE isRead = false;
```

After indexing, the cost becomes:

```text
O(log N + K)
```

Adding indexes on every column is not a good idea. It wastes storage and slows down inserts/updates. The right approach is to create indexes based on real query patterns.

Placement notification query:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'::notification_type
  AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days';
```

Supporting index:

```sql
CREATE INDEX idx_notifications_type_created_student
ON notifications (notificationType, createdAt, studentID);
```

## Stage 4

Fetching notifications on every page load will hit the DB too often. Most of the time, notification data does not change between page loads.

My solution:

- Fetch notifications once after login.
- Keep them in frontend state.
- Use SSE for new notification updates.
- Cache the first page/unread count in Redis.
- Use pagination for older notifications.

Tradeoffs:

- Frontend state reduces API calls, but refresh/logout must be handled properly.
- SSE gives live updates, but reconnect handling is needed.
- Redis improves read speed, but cache invalidation becomes important.

Overall flow:

```text
Login -> fetch first page + unread count
New notification -> push through SSE
Open older notifications -> load using pagination
Mark read -> update DB and cache
```

## Stage 5

The given `notify_all` approach is risky because email sending, DB insert, and app push happen inside one loop. If email fails after 200 students, the system becomes inconsistent and we do not know exactly what completed.

I would separate the work using an outbox/job model:

```text
function notify_all(student_ids, message):
    batch_id = create_batch(message)

    bulk_insert notifications
    bulk_insert email_jobs
    bulk_insert realtime_jobs

    enqueue email workers
    enqueue realtime workers
    return batch_id
```

Worker:

```text
function email_worker():
    jobs = claim_pending_jobs(limit=500)
    for job in jobs:
        try send_email()
        if success -> mark_sent
        if temporary failure -> retry_later
        if permanent failure -> mark_failed
```

DB saving and email sending should not be tightly coupled. The DB should be the source of truth, and email should be retried separately. This makes the system faster, safer, and easier to recover.

## Stage 6

Priority is based on type and recency:

```text
Placement > Result > Event
```

If two notifications have the same type, the newer one comes first.

The actual implementation is in:

```text
notification_app_be/src/services/priority-inbox.js
notification_app_be/src/stage6/priority-inbox-cli.js
```

It fetches notifications from the protected API and keeps only the top `n` using a small heap.

Cost:

```text
O(m log n)
m = notifications fetched
n = inbox size, usually 10
```

For each new notification, maintaining the top 10 costs only:

```text
O(log n)
```

Run:

```bash
npm run priority-inbox
```

## Stage 7

I implemented the frontend using React and Material UI. It runs on:

```text
http://localhost:3000
```

Pages:

```text
/notifications  -> all notifications with filters
/priority       -> top priority notifications
```

Features:

- Responsive Material UI layout.
- Filter by `notification_type`.
- Supports `limit` and `page`.
- Priority page shows top `n` notifications.
- Notifications are shown as `New` or `Viewed`.
- Viewed state is stored in `localStorage`.

Important files:

```text
notification_app_fe/src/App.jsx
notification_app_fe/src/api.js
notification_app_be/src/routes/external-notifications.routes.js
notification_app_be/src/routes/priority.routes.js
```

Run:

```bash
npm start
```
