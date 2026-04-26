ALTER TABLE `contacts` ADD `unsub_email_subject` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `unsub_email_message` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `resub_email_subject` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `resub_email_message` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `sub_change_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contacts` ADD `sub_change_window_start` integer;