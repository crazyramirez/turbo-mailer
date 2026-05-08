CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);--> statement-breakpoint
CREATE INDEX `contacts_status_idx` ON `contacts` (`status`);--> statement-breakpoint
CREATE INDEX `sends_campaign_status_idx` ON `sends` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `sends_sent_at_idx` ON `sends` (`sent_at`);--> statement-breakpoint
CREATE INDEX `te_campaign_idx` ON `tracking_events` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `te_send_idx` ON `tracking_events` (`send_id`);--> statement-breakpoint
CREATE INDEX `te_type_idx` ON `tracking_events` (`event_type`);