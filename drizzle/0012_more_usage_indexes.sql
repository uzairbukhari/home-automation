CREATE INDEX IF NOT EXISTS `idx_cmdlog_status` ON `tuya_command_log` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_actions_status` ON `automation_actions` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_runs_status` ON `automation_runs` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tuya_runs_status` ON `tuya_collection_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_solar_runs_status` ON `solar_collection_runs` (`status`,`finished_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_summaries_gran_period` ON `telemetry_summaries` (`granularity`,`period`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_energy_periods_day` ON `solar_energy_periods` (`period_type`,`period`);
