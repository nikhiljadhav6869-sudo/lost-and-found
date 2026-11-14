ALTER TABLE reports ADD COLUMN productData TEXT;
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN referenceImage INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN lostTime TEXT NOT NULL DEFAULT '';
