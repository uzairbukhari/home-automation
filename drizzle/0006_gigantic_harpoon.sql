CREATE TABLE `notification_deliveries` (
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	PRIMARY KEY(`event_id`, `subscription_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_pending` ON `notification_deliveries` (`status`,`next_attempt`);--> statement-breakpoint
CREATE TABLE `notification_health` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_until` text,
	`lease_token` text,
	`evaluated_at` text,
	`delivered_at` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`config` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `notification_state` (
	`user_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`state` text NOT NULL,
	PRIMARY KEY(`user_id`, `rule_id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_push_user` ON `push_subscriptions` (`user_id`);