CREATE TABLE `match_alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `reportA` text NOT NULL REFERENCES `reports`(`id`) ON DELETE CASCADE,
  `reportB` text NOT NULL REFERENCES `reports`(`id`) ON DELETE CASCADE,
  `score` integer NOT NULL,
  `created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_alert_pair` ON `match_alerts` (`reportA`, `reportB`);
