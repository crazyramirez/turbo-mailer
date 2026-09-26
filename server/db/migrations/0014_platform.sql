CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`automation_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`cursor` text,
	`next_run_at` integer,
	`context` text,
	`last_error` text,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `automation_runs_due_idx` ON `automation_runs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `automation_runs_contact_idx` ON `automation_runs` (`automation_id`,`contact_id`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`trigger` text NOT NULL,
	`steps` text NOT NULL,
	`allow_reentry` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`options` text,
	`sort_order` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_fields_key_unique` ON `custom_fields` (`key`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`list_id` integer,
	`fields` text NOT NULL,
	`tags` text,
	`double_opt_in` integer DEFAULT true,
	`title` text,
	`description` text,
	`button_text` text,
	`success_message` text,
	`redirect_url` text,
	`consent_text` text,
	`theme` text,
	`enabled` integer DEFAULT true,
	`submissions` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_public_id_unique` ON `forms` (`public_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`api_key_id` integer,
	`status_code` integer NOT NULL,
	`response` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `saved_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`html` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`rules` text NOT NULL,
	`cached_count` integer,
	`cached_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_public` integer DEFAULT true,
	`sort_order` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`last_login_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `user_id` integer;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `user_email` text;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `user_id` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` integer;