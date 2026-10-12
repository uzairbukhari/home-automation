CREATE TABLE `upgrade_backup` (
	`kind` text NOT NULL,
	`record_key` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`kind`, `record_key`)
);

--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'telemetry_summaries',CAST(rowid AS TEXT),json_object('source',`source`,'entity_id',`entity_id`,'granularity',`granularity`,'period',`period`,'room',`room`,'data',`data`,'calculation_version',`calculation_version`,'updated_at',`updated_at`) FROM `telemetry_summaries`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'solar_energy_periods',CAST(rowid AS TEXT),json_object('entity_id',`entity_id`,'period_type',`period_type`,'period',`period`,'solar_kwh',`solar_kwh`,'grid_kwh',`grid_kwh`,'home_kwh',`home_kwh`,'solar_source',`solar_source`,'grid_source',`grid_source`,'covered_hours',`covered_hours`,'partial',`partial`,'report_json',`report_json`,'updated_at',`updated_at`) FROM `solar_energy_periods`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'automation_rules',CAST(rowid AS TEXT),json_object('id',`id`,'user_id',`user_id`,'config',`config`,'updated_at',`updated_at`) FROM `automation_rules`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'automation_state',CAST(rowid AS TEXT),json_object('rule_id',`rule_id`,'data',`data`) FROM `automation_state`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'user_settings',CAST(rowid AS TEXT),json_object('user_id',`user_id`,'unit_rate',`unit_rate`,'reference_rate',`reference_rate`,'fixed_charges',`fixed_charges`,'adjustments',`adjustments`,'billing_day',`billing_day`,'battery_capacity',`battery_capacity`,'battery_threshold',`battery_threshold`,'time_of_use',`time_of_use`,'peak_rate',`peak_rate`,'off_peak_rate',`off_peak_rate`,'peak_start',`peak_start`,'peak_end',`peak_end`,'effective_at',`effective_at`,'updated_at',`updated_at`,'tariff_settings',`tariff_settings`) FROM `user_settings`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'tuya_rooms',CAST(rowid AS TEXT),json_object('name',`name`,'created_at',`created_at`) FROM `tuya_rooms`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'tuya_device_preferences',CAST(rowid AS TEXT),json_object('device_id',`device_id`,'room_override',`room_override`,'updated_at',`updated_at`) FROM `tuya_device_preferences`;
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'dashboard_favorites',CAST(rowid AS TEXT),json_object('user_id',`user_id`,'kind',`kind`,'item_id',`item_id`,'created_at',`created_at`) FROM `dashboard_favorites`;
--> statement-breakpoint
--> statement-breakpoint
INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) SELECT 'release_control','photon-v2',json_object('paused',COALESCE((SELECT paused FROM automation_control WHERE id='global'),0),'status','pending') WHERE EXISTS(SELECT 1 FROM automation_rules);
--> statement-breakpoint
INSERT INTO automation_control(id,paused) SELECT 'global',1 WHERE EXISTS(SELECT 1 FROM upgrade_backup WHERE kind='release_control' AND record_key='photon-v2') ON CONFLICT(id) DO UPDATE SET paused=1;
