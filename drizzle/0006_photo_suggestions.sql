CREATE TABLE photo_suggestions (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 image TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 available INTEGER NOT NULL DEFAULT 0, lease TEXT, result TEXT, created INTEGER NOT NULL,
 UNIQUE(userId,image)
);
--> statement-breakpoint
CREATE INDEX photo_suggestions_queue ON photo_suggestions(state,available);
