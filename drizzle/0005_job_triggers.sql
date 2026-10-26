-- Additive triggers: no reports or accounts are removed.
CREATE TRIGGER report_embedding_insert AFTER INSERT ON reports WHEN NEW.demo=0 BEGIN
 INSERT OR IGNORE INTO embedding_jobs(reportId) VALUES(NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER report_embedding_update AFTER UPDATE OF title,description,category,colour,brand,location,date,images ON reports
WHEN NEW.demo=0 AND (OLD.title!=NEW.title OR OLD.description!=NEW.description OR OLD.category!=NEW.category OR OLD.colour!=NEW.colour OR OLD.brand!=NEW.brand OR OLD.location!=NEW.location OR OLD.date!=NEW.date OR OLD.images!=NEW.images) BEGIN
 UPDATE reports SET matchRevision=OLD.matchRevision+1 WHERE id=NEW.id;
 INSERT INTO embedding_jobs(reportId,state,attempts,available,lease,error) VALUES(NEW.id,'pending',0,0,NULL,NULL)
 ON CONFLICT(reportId) DO UPDATE SET state='pending',attempts=0,available=0,lease=NULL,error=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER record_return_time AFTER UPDATE OF status ON claims WHEN NEW.status='Returned' AND OLD.status!='Returned' BEGIN
 UPDATE claims SET resolvedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=NEW.id;
END;
--> statement-breakpoint
INSERT OR IGNORE INTO embedding_jobs(reportId) SELECT id FROM reports WHERE demo=0 AND hidden=0 AND status IN ('Open','Claim Pending');
--> statement-breakpoint
CREATE INDEX notifications_user_created ON notifications(userId,created);
--> statement-breakpoint
CREATE INDEX messages_claim_created ON messages(claimId,created);
--> statement-breakpoint
CREATE INDEX claims_claimant_created ON claims(claimant,created);

--> statement-breakpoint
CREATE TRIGGER report_embedding_reopen AFTER UPDATE OF hidden,status ON reports
WHEN NEW.demo=0 AND NEW.hidden=0 AND NEW.status IN ('Open','Claim Pending')
AND (OLD.hidden!=0 OR OLD.status NOT IN ('Open','Claim Pending')) BEGIN
 INSERT INTO embedding_jobs(reportId,state,attempts,available,lease,error) VALUES(NEW.id,'pending',0,0,NULL,NULL)
 ON CONFLICT(reportId) DO UPDATE SET state='pending',attempts=0,available=0,lease=NULL,error=NULL;
END;
