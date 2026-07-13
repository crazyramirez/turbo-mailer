ALTER TABLE `campaigns` ADD `follow_up_subject` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `follow_up_delay_hours` integer DEFAULT 48;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `follow_up_done_at` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `follow_up_campaign_id` integer;