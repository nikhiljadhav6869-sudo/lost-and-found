CREATE TABLE workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,inviteHash TEXT,created INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE workspace_members(workspaceId TEXT NOT NULL REFERENCES workspaces(id),userId TEXT NOT NULL REFERENCES user(id),role TEXT NOT NULL CHECK(role IN ('student','staff','admin')),PRIMARY KEY(workspaceId,userId));
--> statement-breakpoint
ALTER TABLE reports ADD COLUMN workspaceId TEXT REFERENCES workspaces(id);
--> statement-breakpoint
ALTER TABLE search_jobs ADD COLUMN workspaceId TEXT REFERENCES workspaces(id);
--> statement-breakpoint
CREATE INDEX reports_workspace ON reports(workspaceId,hidden,status,created);
--> statement-breakpoint
CREATE TABLE collection_desks(id TEXT PRIMARY KEY,workspaceId TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,location TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE custody(reportId TEXT PRIMARY KEY REFERENCES reports(id),deskId TEXT NOT NULL REFERENCES collection_desks(id),storage TEXT NOT NULL,receivedBy TEXT NOT NULL REFERENCES user(id),receivedFrom TEXT NOT NULL,receivedAt INTEGER NOT NULL,returnedAt INTEGER);
--> statement-breakpoint
CREATE TABLE collection_codes(claimId TEXT PRIMARY KEY REFERENCES claims(id),salt TEXT NOT NULL,codeHash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumedAt INTEGER,receipt TEXT);
--> statement-breakpoint
CREATE TABLE handover_events(id TEXT PRIMARY KEY,workspaceId TEXT NOT NULL REFERENCES workspaces(id),reportId TEXT REFERENCES reports(id),actor TEXT NOT NULL REFERENCES user(id),recipient TEXT,event TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX handover_report_created ON handover_events(reportId,created);
