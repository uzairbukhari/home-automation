CREATE TABLE `tuya_collection_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`device_count` integer DEFAULT 0 NOT NULL,
	`reading_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `tuya_command_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`requested_value` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_tuya_commands_device_time` ON `tuya_command_log` (`device_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `tuya_device_preferences` (
	`device_id` text PRIMARY KEY NOT NULL,
	`room_override` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tuya_device_state` (
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`value_json` text NOT NULL,
	`value_type` text NOT NULL,
	`numeric_value` real,
	`unit` text DEFAULT '' NOT NULL,
	`source_timestamp` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`device_id`, `code`, `source_timestamp`)
);
--> statement-breakpoint
CREATE INDEX `idx_tuya_state_device_time` ON `tuya_device_state` (`device_id`,`source_timestamp`);