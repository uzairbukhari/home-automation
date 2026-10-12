CREATE TABLE `dashboard_favorites` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `solar_collection_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`samples` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `solar_energy_periods` (
	`entity_id` text NOT NULL,
	`period_type` text NOT NULL,
	`period` text NOT NULL,
	`solar_kwh` real,
	`grid_kwh` real,
	`home_kwh` real,
	`solar_source` text NOT NULL,
	`grid_source` text NOT NULL,
	`covered_hours` real DEFAULT 0 NOT NULL,
	`partial` integer DEFAULT true NOT NULL,
	`report_json` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`entity_id`, `period_type`, `period`)
);
--> statement-breakpoint
CREATE TABLE `solar_samples` (
	`entity_id` text NOT NULL,
	`source_timestamp` text NOT NULL,
	`data` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`entity_id`, `source_timestamp`)
);
--> statement-breakpoint
CREATE INDEX `idx_solar_samples_time` ON `solar_samples` (`source_timestamp`);--> statement-breakpoint
CREATE TABLE `solar_sync_state` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`next_backfill_date` text,
	`oldest_date` text,
	`recovered_through` text,
	`lease_until` text,
	`lease_token` text
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `tariff_settings` text DEFAULT '{}' NOT NULL;