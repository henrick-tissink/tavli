ALTER TABLE reservations ADD COLUMN IF NOT EXISTS locale varchar(5) NOT NULL DEFAULT 'ro';
ALTER TABLE event_requests ADD COLUMN IF NOT EXISTS locale varchar(5) NOT NULL DEFAULT 'ro';
