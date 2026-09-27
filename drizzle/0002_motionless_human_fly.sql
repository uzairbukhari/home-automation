CREATE TABLE `backfill_state` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor_date` text,
	`done_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `ingest_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`rows` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingest_runs_source_started_idx` ON `ingest_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE TABLE `tuya_energy_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`date` text NOT NULL,
	`kwh` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `tuya_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tuya_energy_daily_device_date_idx` ON `tuya_energy_daily` (`device_id`,`date`);--> statement-breakpoint
CREATE TABLE `tuya_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`device_id` text NOT NULL,
	`code` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `tuya_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tuya_events_device_ts_idx` ON `tuya_events` (`device_id`,`ts`);--> statement-breakpoint
DROP INDEX `inverter_readings_ts_idx`;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `pv_v` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `pv_a` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `grid_hz` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `output_v` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `output_hz` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `load_pct` real;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `raw_points` text;--> statement-breakpoint
ALTER TABLE `inverter_readings` ADD `source` text DEFAULT 'poll' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `inverter_readings_ts_idx` ON `inverter_readings` (`ts`);--> statement-breakpoint
ALTER TABLE `settings` ADD `grid_co2_kg_per_kwh` real DEFAULT 0.45 NOT NULL;--> statement-breakpoint
ALTER TABLE `tuya_readings` ADD `voltage_v` real;--> statement-breakpoint
ALTER TABLE `tuya_readings` ADD `current_a` real;--> statement-breakpoint
ALTER TABLE `tuya_readings` ADD `add_ele_kwh` real;