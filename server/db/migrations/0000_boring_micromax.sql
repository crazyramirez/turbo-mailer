CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`template_name` text,
	`template_html` text,
	`list_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer,
	`total_recipients` integer DEFAULT 0,
	`sent_count` integer DEFAULT 0,
	`open_count` integer DEFAULT 0,
	`click_count` integer DEFAULT 0,
	`fail_count` integer DEFAULT 0,
	`unsub_email_subject` text,
	`unsub_email_message` text,
	`resub_email_subject` text,
	`resub_email_message` text,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`company` text,
	`role` text,
	`phone` text,
	`linkedin` text,
	`url` text,
	`youtube` text,
	`instagram` text,
	`tags` text DEFAULT '[]',
	`status` text DEFAULT 'active' NOT NULL,
	`sub_change_count` integer DEFAULT 0,
	`sub_change_window_start` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`);--> statement-breakpoint
CREATE TABLE `list_contacts` (
	`list_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#6366f1',
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`contact_id` integer,
	`email` text NOT NULL,
	`personalized_subject` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	`error_msg` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `tracking_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`send_id` integer,
	`campaign_id` integer,
	`contact_id` integer,
	`event_type` text NOT NULL,
	`url` text,
	`ip` text,
	`user_agent` text,
	`created_at` integer,
	FOREIGN KEY (`send_id`) REFERENCES `sends`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
