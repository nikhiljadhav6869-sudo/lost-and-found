CREATE TABLE `embedding_jobs` (
	`reportId` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`error` text,
	FOREIGN KEY (`reportId`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `embedding_queue` ON `embedding_jobs` (`state`,`available`);--> statement-breakpoint
CREATE TABLE `embeddings` (
	`reportId` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`model` text NOT NULL,
	`textVector` text NOT NULL,
	`imageVector` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`reportId`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `match_feedback` (
	`userId` text NOT NULL,
	`reportId` text NOT NULL,
	`otherId` text NOT NULL,
	`relevant` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reportId`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`otherId`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_unique` ON `match_feedback` (`userId`,`reportId`,`otherId`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`duration` integer,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_created` ON `operations` (`created`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`userId` text PRIMARY KEY NOT NULL,
	`matches` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`query` text NOT NULL,
	`image` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`lease` text,
	`available` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`textVector` text,
	`imageVector` text,
	`model` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_queue` ON `search_jobs` (`state`,`available`);--> statement-breakpoint
ALTER TABLE `claims` ADD `resolvedAt` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `matchRevision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `reports_public` ON `reports` (`hidden`,`demo`,`type`,`status`,`created`);--> statement-breakpoint
CREATE INDEX `reports_owner` ON `reports` (`owner`,`created`);