CREATE TABLE `upload_cleanup` (`id` text PRIMARY KEY NOT NULL, `created` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `uploads_created` ON `uploads` (`created`);
