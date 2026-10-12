CREATE TABLE `app_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`next_due` text,
	`last_success` text,
	`error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_actions` (
	`run_id` text NOT NULL,
	`action_index` integer NOT NULL,
	`command_id` integer,
	`status` text NOT NULL,
	`error` text,
	PRIMARY KEY(`run_id`, `action_index`)
);
--> statement-breakpoint
CREATE TABLE `automation_control` (
	`id` text PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`started_at` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`inputs` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_runs_time` ON `automation_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `automation_state` (
	`rule_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `capability_versions` (
	`device_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`device_id`, `effective_at`)
);
--> statement-breakpoint
CREATE TABLE `channel_overrides` (
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`until` text NOT NULL,
	PRIMARY KEY(`device_id`, `code`)
);
--> statement-breakpoint
CREATE TABLE `command_context` (
	`command_id` integer PRIMARY KEY NOT NULL,
	`raw_value` text NOT NULL,
	`origin` text NOT NULL,
	`run_id` text,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_details` (
	`device_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`collected_at` text NOT NULL,
	`metadata_at` text,
	`alias` text,
	`channel_labels` text DEFAULT '{}' NOT NULL,
	`upstream` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_room_history` (
	`device_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`room` text NOT NULL,
	PRIMARY KEY(`device_id`, `effective_at`)
);
--> statement-breakpoint
CREATE TABLE `history_coverage` (
	`source` text NOT NULL,
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`recorded_at` text NOT NULL,
	PRIMARY KEY(`source`, `entity_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `operational_daily` (
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`date`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `provider_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`timestamp` text NOT NULL,
	`status` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_provider_requests_time` ON `provider_requests` (`timestamp`);--> statement-breakpoint
CREATE TABLE `settings_versions` (
	`user_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`user_id`, `effective_at`)
);
--> statement-breakpoint
CREATE TABLE `solar_raw_fields` (
	`entity_id` text NOT NULL,
	`source_timestamp` text NOT NULL,
	`data` text NOT NULL,
	`collected_at` text NOT NULL,
	PRIMARY KEY(`entity_id`, `source_timestamp`)
);
--> statement-breakpoint
CREATE TABLE `telemetry_summaries` (
	`source` text NOT NULL,
	`entity_id` text NOT NULL,
	`granularity` text NOT NULL,
	`period` text NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`calculation_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`source`, `entity_id`, `granularity`, `period`, `room`)
);
--> statement-breakpoint
CREATE INDEX `idx_summaries_period` ON `telemetry_summaries` (`source`,`granularity`,`period`);--> statement-breakpoint
CREATE TABLE `tuya_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`actions` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tuya_latest` (
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`value_json` text NOT NULL,
	`numeric_value` real,
	`unit` text DEFAULT '' NOT NULL,
	`source_timestamp` text NOT NULL,
	`collected_at` text NOT NULL,
	`quality` text NOT NULL,
	PRIMARY KEY(`device_id`, `code`)
);
--> statement-breakpoint
CREATE TABLE `tuya_observations` (
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`value_json` text NOT NULL,
	`source_timestamp` text NOT NULL,
	`observed_at` text NOT NULL,
	`quality` text NOT NULL,
	PRIMARY KEY(`device_id`, `code`, `observed_at`)
);
--> statement-breakpoint
CREATE INDEX `idx_tuya_observed` ON `tuya_observations` (`device_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `tuya_scenes` (
	`home_id` text NOT NULL,
	`scene_id` text NOT NULL,
	`name` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`home_id`, `scene_id`)
);
--> statement-breakpoint
CREATE TABLE `tuya_sync` (
	`device_id` text PRIMARY KEY NOT NULL,
	`from_ms` integer,
	`to_ms` integer,
	`cursor` text,
	`covered_through` text,
	`error` text
);
