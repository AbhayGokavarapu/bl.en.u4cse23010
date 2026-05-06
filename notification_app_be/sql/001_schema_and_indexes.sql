DO $$
BEGIN
  CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  "studentID" BIGINT NOT NULL,
  "notificationType" notification_type NOT NULL,
  title TEXT,
  message TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_unread_student_created_at
ON notifications ("studentID", "createdAt")
WHERE "isRead" = false;

CREATE INDEX IF NOT EXISTS idx_notifications_student_read_created_at
ON notifications ("studentID", "isRead", "createdAt");

CREATE INDEX IF NOT EXISTS idx_notifications_student_created_at
ON notifications ("studentID", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_created_student
ON notifications ("notificationType", "createdAt", "studentID");
