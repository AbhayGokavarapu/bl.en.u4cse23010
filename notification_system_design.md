## Stage 1

### Core Actions

The notification platform should support these user actions:

- Fetch notifications for a logged-in student.
- Filter notifications by read status and notification type.
- Fetch unread notification count.
- Mark one notification as read.
- Mark all notifications as read.
- Receive real-time notifications while the user is online.

In production, `studentID` should come from the authenticated token. In this implementation it is kept as a path parameter so the API can be tested directly.

### Common Headers

```http
Authorization: Bearer <access_token>
Accept: application/json
Content-Type: application/json
```

### List Notifications

```http
GET /api/notifications/students/{studentID}?status=unread&type=Event&limit=20&offset=0
```

Response:

```json
{
  "studentID": 1042,
  "limit": 20,
  "offset": 0,
  "notifications": [
    {
      "id": 501,
      "studentID": 1042,
      "notificationType": "Event",
      "title": "Workshop Reminder",
      "message": "Cloud workshop starts at 10 AM.",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-05-06T08:30:00.000Z"
    }
  ]
}
```

### Get Unread Count

```http
GET /api/notifications/students/{studentID}/unread-count
```

Response:

```json
{
  "studentID": 1042,
  "unreadCount": 7
}
```

### Mark One Notification As Read

```http
PATCH /api/notifications/students/{studentID}/notifications/{notificationID}/read
```

Response:

```json
{
  "notification": {
    "id": 501,
    "studentID": 1042,
    "notificationType": "Event",
    "title": "Workshop Reminder",
    "message": "Cloud workshop starts at 10 AM.",
    "isRead": true,
    "readAt": "2026-05-06T09:00:00.000Z",
    "createdAt": "2026-05-06T08:30:00.000Z"
  }
}
```

### Mark All Notifications As Read

```http
PATCH /api/notifications/students/{studentID}/read-all
```

Response:

```json
{
  "studentID": 1042,
  "updatedCount": 6
}
```

### Create Notification

This endpoint is intended for backend/admin services that create notifications.

```http
POST /api/notifications/students/{studentID}/notifications
```

Request:

```json
{
  "notificationType": "Placement",
  "title": "Placement Drive",
  "message": "A new placement drive has been announced."
}
```

Response:

```json
{
  "notification": {
    "id": 801,
    "studentID": 1042,
    "notificationType": "Placement",
    "title": "Placement Drive",
    "message": "A new placement drive has been announced.",
    "isRead": false,
    "readAt": null,
    "createdAt": "2026-05-06T09:30:00.000Z"
  }
}
```

### Real-Time Notifications

Real-time delivery is implemented with Server-Sent Events because notifications flow from server to client.

```http
GET /api/notifications/students/{studentID}/stream
Accept: text/event-stream
Cache-Control: no-cache
```

Event:

```text
event: notification
data: {"id":801,"studentID":1042,"notificationType":"Placement","title":"Placement Drive","message":"A new placement drive has been announced.","isRead":false,"readAt":null,"createdAt":"2026-05-06T09:30:00.000Z"}
```

## Stage 2

### Storage Choice

I suggest PostgreSQL for persistent storage. Notifications need reliable writes, filtering by student, read/unread updates, ordering by time, and transactional consistency. PostgreSQL is a good fit because it supports relational constraints, indexes, partial indexes, enums, transactions, JSON fields if required later, and partitioning when the table becomes large.

### DB Schema

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

CREATE INDEX idx_notifications_type_created_student
ON notifications ("notificationType", "createdAt", "studentID");
```

### API Queries

Fetch notifications:

```sql
SELECT id,
       "studentID",
       "notificationType",
       title,
       message,
       "isRead",
       "readAt",
       "createdAt"
FROM notifications
WHERE "studentID" = $1
ORDER BY "createdAt" DESC
LIMIT $2 OFFSET $3;
```

Fetch unread notifications:

```sql
SELECT id,
       "studentID",
       "notificationType",
       title,
       message,
       "isRead",
       "readAt",
       "createdAt"
FROM notifications
WHERE "studentID" = $1
  AND "isRead" = false
ORDER BY "createdAt" ASC
LIMIT $2 OFFSET $3;
```

Unread count:

```sql
SELECT COUNT(*)::int AS count
FROM notifications
WHERE "studentID" = $1
  AND "isRead" = false;
```

Mark one notification as read:

```sql
UPDATE notifications
SET "isRead" = true,
    "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
WHERE id = $1
  AND "studentID" = $2
RETURNING *;
```

Mark all notifications as read:

```sql
UPDATE notifications
SET "isRead" = true,
    "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
WHERE "studentID" = $1
  AND "isRead" = false;
```

### Problems As Data Grows

The main problems are slow scans, expensive sorting, large unread counts, write amplification from too many indexes, table bloat due to frequent read-status updates, and large fan-out writes when one message is sent to every student.

Solutions:

- Use targeted composite and partial indexes instead of indexing every column.
- Use keyset pagination for infinite scrolling instead of large offsets.
- Partition old notification data by month or year if the table becomes very large.
- Archive or expire old low-value notifications.
- Use batch inserts and background workers for high-volume fan-out.
- Cache unread counts with careful invalidation if count queries become hot.

## Stage 3

### Existing Query

```sql
SELECT *
FROM notifications
WHERE studentID = 1042
  AND isRead = false
ORDER BY createdAt ASC;
```

This query is logically correct if each notification row is stored for one student and `isRead` represents that student's read status. If one notification can be sent to many students, a better schema would separate notification content from per-student delivery/read status using tables such as `notifications` and `student_notifications`.

The query is slow because the database has about 5,000,000 notification rows. Without a useful index, the database may scan the full table to find rows for `studentID = 1042` and `isRead = false`, then sort those matching rows by `createdAt`.

Without an index, the likely computational cost is:

```text
Filtering rows: O(N), where N = total notifications
Sorting matches: O(K log K), where K = unread notifications for the student
Total: O(N + K log K)
```

### Change Needed

Create an index that matches the filter and sort pattern used by the API.

For PostgreSQL, a partial index is efficient because the API only fetches unread notifications:

```sql
CREATE INDEX idx_notifications_unread_student_created_at
ON notifications (studentID, createdAt)
WHERE isRead = false;
```

For MySQL or a general SQL database, use a composite index:

```sql
CREATE INDEX idx_notifications_student_read_created_at
ON notifications (studentID, isRead, createdAt);
```

After this index, the database can directly find unread notifications for one student and read them in `createdAt ASC` order.

The likely computational cost becomes:

```text
Index lookup: O(log N)
Reading matching rows in order: O(K)
Total: O(log N + K)
```

The API query should also avoid `SELECT *` and use pagination:

```sql
SELECT studentID,
       notificationType,
       createdAt
FROM notifications
WHERE studentID = 1042
  AND isRead = false
ORDER BY createdAt ASC
LIMIT 50;
```

### Indexes On Every Column

Adding indexes on every column is not effective. Indexes improve only the queries that can use them. They also increase storage and slow down inserts, updates, and deletes because every index must be maintained whenever data changes.

For this query, separate indexes on every column are less useful than one composite index on `(studentID, isRead, createdAt)` because the query filters by `studentID` and `isRead`, then orders by `createdAt`.

### Students Who Got Placement Notifications In The Last 7 Days

PostgreSQL:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'::notification_type
  AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days';
```

MySQL:

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL 7 DAY;
```

Recommended index for this query:

```sql
CREATE INDEX idx_notifications_type_created_student
ON notifications (notificationType, createdAt, studentID);
```

With this index, the database can search only the `Placement` rows in the last 7 days and then return the distinct students.

Likely computational cost:

```text
Index range lookup: O(log N)
Scanning recent placement notifications: O(P), where P = placement notifications in the last 7 days
Finding distinct student IDs: O(P)
Total: O(log N + P)
```

## Stage 4

Fetching notifications on every page load overloads the DB because each page view creates repeated reads for data that usually has not changed.

Recommended solution:

- Fetch notifications only once after login and keep them in the frontend state.
- Use the unread count endpoint for lightweight badge updates.
- Use Server-Sent Events to push new notifications instead of polling aggressively.
- Cache the first page of notifications in Redis with a short TTL.
- Use keyset pagination for older notifications.
- Use HTTP cache validators such as `ETag` or `Last-Modified` for unchanged responses.

Tradeoffs:

- Frontend state reduces repeated API calls, but the app must handle refreshes and logout correctly.
- SSE gives near real-time updates and reduces polling, but it needs connection handling and reconnect logic.
- Redis cache improves hot reads, but it adds cache invalidation complexity when notifications are marked read.
- Keyset pagination is faster than offset pagination for large data, but the frontend must pass cursor fields such as `createdAt` and `id`.
- Short TTL caching may briefly show stale data, but it protects the DB during traffic spikes.

Final approach:

```text
Login -> fetch first notification page + unread count
New notification -> server pushes via SSE
Open inbox -> load next pages using keyset pagination
Mark read -> update DB, invalidate cache, update frontend state
```

## Stage 5

The proposed implementation is weak because it sends email, writes the DB row, and pushes the in-app notification inside one synchronous loop. If email fails midway, some students may receive email while others do not. It is also slow because 50,000 students are processed one by one, and it has no retry, batching, idempotency, monitoring, or failure recovery.

Saving to DB and sending email should not happen as one tightly coupled operation. The DB write should be the source of truth, and email delivery should be handled asynchronously by workers. This gives reliability: even if email fails for 200 students, those failed jobs can be retried without recreating all notifications.

Recommended redesign:

```text
function notify_all(student_ids, message):
    batch_id = create_notification_batch(message)

    db.transaction:
        bulk_insert notifications for all student_ids with batch_id
        bulk_insert email_outbox jobs for all student_ids with batch_id
        bulk_insert realtime_outbox jobs for online delivery

    enqueue email workers with batch_id
    enqueue realtime workers with batch_id
    return batch_id

function email_worker(batch_id):
    while jobs exist:
        jobs = claim_pending_email_jobs(batch_id, limit=500)
        for job in jobs:
            try:
                send_email(job.student_id, job.message)
                mark_job_sent(job.id)
            except temporary_error:
                retry_later(job.id)
            except permanent_error:
                mark_job_failed(job.id)

function realtime_worker(batch_id):
    jobs = claim_pending_realtime_jobs(batch_id, limit=1000)
    for job in jobs:
        push_to_app(job.student_id, job.message)
        mark_job_sent(job.id)
```

This design is faster because DB writes are batched and workers can run in parallel. It is more reliable because each email job has its own status and retry count. The system can resume from the failed 200 students instead of restarting the whole notify-all process.

## Stage 6

Priority Inbox ranks unread notifications using both type weight and recency:

```text
Placement = 3
Result = 2
Event = 1
```

When two notifications have different types, the higher type weight wins. When they have the same type, the newer timestamp wins. The implementation does not query a database or hard-code notifications. It fetches notifications from the protected API:

```text
GET http://20.207.122.201/evaluation-service/notifications
```

Actual code is implemented in:

```text
notification_app_be/src/services/priority-inbox.js
notification_app_be/src/services/affordmed-api.js
notification_app_be/src/stage6/priority-inbox-cli.js
```

Run:

```bash
npm run priority-inbox
```

The code maintains top 10 efficiently with a bounded min-heap. If there are `m` notifications and the inbox size is `n = 10`, the cost is:

```text
O(m log n)
```

For new incoming notifications, only one heap insertion is needed:

```text
O(log n)
```

This keeps the top 10 efficient even when new notifications keep arriving.

## Stage 7

The frontend is implemented as a React application using Material UI for styling. It runs through the existing Express server on:

```text
http://localhost:3000
```

The application has two pages:

- `/notifications` displays all notifications from the protected AffordMed API.
- `/priority` displays priority notifications ranked by `Placement > Result > Event` and then by recency.

The browser never stores the client secret. The React app calls backend proxy endpoints on the same localhost server:

```text
GET /api/external-notifications?limit=10&page=1&notification_type=Placement
GET /api/priority-inbox/top?limit=10&scanLimit=100&notification_type=Placement
```

The backend handles authentication with:

```text
POST http://20.207.122.201/evaluation-service/auth
GET  http://20.207.122.201/evaluation-service/notifications
```

### Frontend Features

- Responsive React UI built with Material UI components.
- Separate pages for all notifications and priority notifications.
- Query controls for `limit`, `page`, and `notification_type`.
- Priority page supports configurable top `n`.
- Notifications are marked as `New` or `Viewed`.
- Viewed state is stored in browser `localStorage` using notification IDs.
- The UI can mark one notification as viewed or mark the current page/top list as viewed.

### Files

```text
notification_app_fe/src/App.jsx
notification_app_fe/src/api.js
notification_app_fe/src/viewedStore.js
notification_app_fe/src/main.jsx
notification_app_be/src/routes/external-notifications.routes.js
notification_app_be/src/routes/priority.routes.js
```

Run:

```bash
npm run build:fe
npm start
```
