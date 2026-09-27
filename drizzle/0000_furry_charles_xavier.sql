CREATE TABLE `auth_tokens` (
	`provider` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `energy_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`pv_kwh` real DEFAULT 0 NOT NULL,
	`load_kwh` real DEFAULT 0 NOT NULL,
	`grid_import_kwh` real DEFAULT 0 NOT NULL,
	`grid_export_kwh` real DEFAULT 0 NOT NULL,
	`batt_charge_kwh` real DEFAULT 0 NOT NULL,
	`batt_discharge_kwh` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `energy_daily_date_unique` ON `energy_daily` (`date`);--> statement-breakpoint
CREATE TABLE `inverter_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`pv_w` real NOT NULL,
	`load_w` real NOT NULL,
	`battery_w` real NOT NULL,
	`battery_soc` real NOT NULL,
	`battery_v` real,
	`battery_a` real,
	`grid_w` real,
	`grid_v` real,
	`inverter_temp_c` real,
	`mode` text,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `inverter_readings_ts_idx` ON `inverter_readings` (`ts`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'PKR' NOT NULL,
	`flat_rate_per_kwh` real,
	`peak_rate_per_kwh` real,
	`off_peak_rate_per_kwh` real,
	`peak_start_hour` integer,
	`peak_end_hour` integer,
	`system_cost_pkr` real,
	`panel_kwp` real DEFAULT 3.5 NOT NULL,
	`battery_kwh` real DEFAULT 5.2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tuya_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`online` integer DEFAULT false NOT NULL,
	`room` text,
	`icon` text,
	`last_status` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `tuya_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`device_id` text NOT NULL,
	`power_w` real,
	`energy_kwh` real,
	`extra` text,
	FOREIGN KEY (`device_id`) REFERENCES `tuya_devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tuya_readings_device_ts_idx` ON `tuya_readings` (`device_id`,`ts`);