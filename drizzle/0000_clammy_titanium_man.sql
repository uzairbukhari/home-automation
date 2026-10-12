CREATE TABLE `connection_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`last_success_at` text,
	`last_error_code` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`room` text,
	`online` integer DEFAULT false NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`entity_id` text NOT NULL,
	`metric` text NOT NULL,
	`value` real,
	`unit` text NOT NULL,
	`quality` text DEFAULT 'good' NOT NULL,
	`source_timestamp` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_observations_dedupe` ON `observations` (`source`,`entity_id`,`metric`,`source_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_observations_metric_time` ON `observations` (`metric`,`source_timestamp`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`unit_rate` real DEFAULT 13.01 NOT NULL,
	`reference_rate` real DEFAULT 10.54 NOT NULL,
	`fixed_charges` real DEFAULT 300 NOT NULL,
	`adjustments` real DEFAULT 0 NOT NULL,
	`billing_day` integer DEFAULT 1 NOT NULL,
	`battery_capacity` real DEFAULT 5.2 NOT NULL,
	`battery_threshold` integer DEFAULT 39 NOT NULL,
	`time_of_use` integer DEFAULT false NOT NULL,
	`peak_rate` real DEFAULT 46.85 NOT NULL,
	`off_peak_rate` real DEFAULT 34.53 NOT NULL,
	`peak_start` text DEFAULT '17:00' NOT NULL,
	`peak_end` text DEFAULT '22:00' NOT NULL,
	`effective_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
