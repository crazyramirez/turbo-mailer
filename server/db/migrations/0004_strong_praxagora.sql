ALTER TABLE `campaigns` ADD `unsub_email_subject` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `unsub_email_message` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `resub_email_subject` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `resub_email_message` text;--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `unsub_email_subject`;--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `unsub_email_message`;--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `resub_email_subject`;--> statement-breakpoint
ALTER TABLE `contacts` DROP COLUMN `resub_email_message`;