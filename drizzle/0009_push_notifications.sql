ALTER TABLE preferences ADD COLUMN pushMatches INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE preferences ADD COLUMN pushClaims INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE push_subscriptions(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE push_deliveries(notificationId TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,subscriptionId TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 0,lease TEXT,PRIMARY KEY(notificationId,subscriptionId));
--> statement-breakpoint
CREATE TRIGGER notification_push_insert AFTER INSERT ON notifications BEGIN
 INSERT OR IGNORE INTO push_deliveries(notificationId,subscriptionId)
 SELECT NEW.id,s.id FROM push_subscriptions s WHERE s.userId=NEW.userId
 AND NOT EXISTS(SELECT 1 FROM preferences p WHERE p.userId=NEW.userId AND CASE WHEN NEW.body LIKE 'Strong match%' THEN p.pushMatches=0 ELSE p.pushClaims=0 END);
END;
--> statement-breakpoint
CREATE INDEX push_delivery_queue ON push_deliveries(state,available);
