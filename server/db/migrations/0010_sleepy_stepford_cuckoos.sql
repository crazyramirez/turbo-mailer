ALTER TABLE `campaigns` ADD `subject_b` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ab_sample_pct` integer DEFAULT 20;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ab_wait_minutes` integer DEFAULT 240;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ab_phase` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ab_decide_at` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `ab_winner` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `variant` text;