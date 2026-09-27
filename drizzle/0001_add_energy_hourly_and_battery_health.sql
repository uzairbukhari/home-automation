CREATE TABLE `battery_health_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`min_soc_pct` real,
	`max_soc_pct` real,
	`charge_kwh` real DEFAULT 0 NOT NULL,
	`discharge_kwh` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `battery_health_daily_date_unique` ON `battery_health_daily` (`date`);--> statement-breakpoint
CREATE TABLE `energy_hourly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`hour_of_day` integer NOT NULL,
	`pv_wh` real DEFAULT 0 NOT NULL,
	`load_wh` real DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_hourly_date_hour_idx` ON `energy_hourly` (`date`,`hour_of_day`);