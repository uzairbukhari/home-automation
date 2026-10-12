CREATE TABLE `provider_backfill` (
	`provider` text NOT NULL,
	`entity_id` text NOT NULL,
	`dataset` text NOT NULL,
	`oldest_covered` text,
	`covered_through` text,
	`cursor` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`rows_total` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider`, `entity_id`, `dataset`)
);
--> statement-breakpoint
CREATE TABLE `provider_documents` (
	`provider` text NOT NULL,
	`entity_id` text NOT NULL,
	`dataset` text NOT NULL,
	`data` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider`, `entity_id`, `dataset`)
);
--> statement-breakpoint
CREATE TABLE `provider_events` (
	`provider` text NOT NULL,
	`entity_id` text NOT NULL,
	`event_time` text NOT NULL,
	`kind` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`provider`, `entity_id`, `event_time`, `kind`, `code`)
);
