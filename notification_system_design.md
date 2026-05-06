## Stage 1
The system should support viewing notifications, filtering by type/status, unread count, marking read, marking all read, creating notifications, and live updates.
APIs:
```http
GET /api/notifications/students/{studentID}
GET /api/notifications/students/{studentID}/unread-count
PATCH /api/notifications/students/{studentID}/notifications/{notificationID}/read
PATCH /api/notifications/students/{studentID}/read-all
POST /api/notifications/students/{studentID}/notifications
GET /api/notifications/students/{studentID}/stream
```
Real-time updates are done using Server-Sent Events.

## Stage 2
I would use PostgreSQL because the system needs reliable writes, filtering, ordering by time, and read/unread updates.
Schema:
```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  studentID BIGINT NOT NULL,
  notificationType notification_type NOT NULL,
  message TEXT,
  isRead BOOLEAN DEFAULT false,
  createdAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_read_time ON notifications(studentID, isRead, createdAt);
```
As volume grows, slow scans, sorting, unread counts, and fan-out writes become problems. I would use indexes, pagination, caching, archiving, and background workers.

## Stage 3
The query is correct if each row belongs to one student, but it is slow because 5,000,000 rows may be scanned and sorted.
Without index: `O(N + K log K)`.
Better index:
```sql
CREATE INDEX idx_student_read_created ON notifications(studentID, isRead, createdAt);
```
With index: `O(log N + K)`.
Indexing every column is bad because it wastes storage and slows writes.
Placement students in last 7 days:
```sql
SELECT DISTINCT studentID FROM notifications
WHERE notificationType = 'Placement'
AND createdAt >= NOW() - INTERVAL '7 days';
```

## Stage 4
Fetching notifications on every page load will overload the DB.
I would fetch once after login, store in frontend state, and use SSE for new updates.
Redis can cache unread count and first page. Older notifications should use pagination.
Tradeoff: cache improves speed but needs invalidation after read-status changes.

## Stage 5
The `notify_all` loop is risky because email, DB insert, and app push happen together.
If email fails midway, the system becomes inconsistent.
Better approach: bulk insert notifications, create email/realtime jobs, and let workers process them with retries.
DB should be the source of truth. Email sending should be async and retryable.

## Stage 6
Priority rule is `Placement > Result > Event`; newer notifications win inside the same type.
The code fetches notifications from the protected API and keeps top `n` using a heap.
Cost is `O(m log n)`, and each new notification costs `O(log n)`.
Code: `notification_app_be/src/services/priority-inbox.js`.

## Stage 7
Frontend is built with React and Material UI and runs at `http://localhost:3000`.
Pages: `/notifications` for all notifications and `/priority` for priority inbox.
It supports `limit`, `page`, `notification_type`, responsive UI, and New/Viewed state using localStorage.
