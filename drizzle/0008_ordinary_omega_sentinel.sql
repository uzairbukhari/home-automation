CREATE TABLE `automation_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` text NOT NULL,
	`run_id` text,
	`command_id` integer,
	`occurred_at` text NOT NULL,
	`status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`inputs` text DEFAULT '[]' NOT NULL,
	`previous_inputs` text DEFAULT '[]' NOT NULL,
	`rule_snapshot` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_rule_time` ON `automation_activity` (`rule_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_time` ON `automation_activity` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `period_coverage` (
	`provider` text NOT NULL,
	`entity_id` text NOT NULL,
	`period` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider`, `entity_id`, `period`)
);
--> statement-breakpoint
CREATE TABLE `provider_budget` (
	`provider` text NOT NULL,
	`period` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`provider`, `period`)
);
