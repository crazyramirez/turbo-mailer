CREATE TABLE `blocklist_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target` text NOT NULL,
	`target_type` text NOT NULL,
	`zone` text NOT NULL,
	`result` text NOT NULL,
	`detail` text,
	`checked_at` integer
);
--> statement-breakpoint
CREATE INDEX `blocklist_checked_idx` ON `blocklist_checks` (`checked_at`);--> statement-breakpoint
CREATE TABLE `consent_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer,
	`email_hash` text NOT NULL,
	`action` text NOT NULL,
	`source` text,
	`ip` text,
	`user_agent` text,
	`consent_text` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `consent_hash_idx` ON `consent_log` (`email_hash`);--> statement-breakpoint
CREATE INDEX `consent_contact_idx` ON `consent_log` (`contact_id`);--> statement-breakpoint
CREATE TABLE `dmarc_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_key` text NOT NULL,
	`org_name` text,
	`domain` text,
	`policy` text,
	`date_begin` integer,
	`date_end` integer,
	`total` integer DEFAULT 0,
	`dmarc_pass` integer DEFAULT 0,
	`spf_aligned` integer DEFAULT 0,
	`dkim_aligned` integer DEFAULT 0,
	`sources` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dmarc_reports_report_key_unique` ON `dmarc_reports` (`report_key`);--> statement-breakpoint
CREATE TABLE `placement_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer,
	`token` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`results` text,
	`created_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `placement_tests_token_unique` ON `placement_tests` (`token`);--> statement-breakpoint
CREATE TABLE `suppressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_hash` text NOT NULL,
	`reason` text NOT NULL,
	`detail` text,
	`source` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppressions_email_hash_unique` ON `suppressions` (`email_hash`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `preheader` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `kind` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `segment_id` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `topic_id` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `sender_profile_id` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `sto_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ignore_sunset` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `utm_params` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `pause_reason` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `bounce_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `complaint_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `unsubscribe_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ai_insights` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `custom` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `source` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `topic_opt_outs` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `last_sent_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `last_engaged_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `sent_since_engaged` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contacts` ADD `engagement_score` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contacts` ADD `best_send_hour` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `verification` text;--> statement-breakpoint
CREATE INDEX `contacts_last_engaged_idx` ON `contacts` (`last_engaged_at`);--> statement-breakpoint
ALTER TABLE `sends` ADD `message_id` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `scheduled_for` integer;--> statement-breakpoint
ALTER TABLE `sends` ADD `attempts` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sends` ADD `profile_id` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `bounce_class` text;--> statement-breakpoint
CREATE INDEX `sends_message_id_idx` ON `sends` (`message_id`);--> statement-breakpoint
CREATE INDEX `sends_contact_idx` ON `sends` (`contact_id`);--> statement-breakpoint
CREATE INDEX `sends_email_idx` ON `sends` (`email`);--> statement-breakpoint
UPDATE `contacts` SET `last_engaged_at` = (SELECT MAX(te.`created_at`) FROM `tracking_events` te WHERE te.`contact_id` = `contacts`.`id` AND (te.`event_type` = 'click' OR (te.`event_type` = 'open' AND COALESCE(te.`is_proxy`, 0) = 0)));--> statement-breakpoint
UPDATE `contacts` SET `last_sent_at` = (SELECT MAX(s.`sent_at`) FROM `sends` s WHERE s.`contact_id` = `contacts`.`id` AND s.`status` IN ('sent', 'opened'));--> statement-breakpoint
UPDATE `contacts` SET `sent_since_engaged` = (SELECT COUNT(*) FROM `sends` s WHERE s.`contact_id` = `contacts`.`id` AND s.`status` IN ('sent', 'opened') AND (`contacts`.`last_engaged_at` IS NULL OR s.`sent_at` > `contacts`.`last_engaged_at`));
