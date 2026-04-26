PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tracking_events` (
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
--> statement-breakpoint
INSERT INTO `__new_tracking_events`("id", "send_id", "campaign_id", "contact_id", "event_type", "url", "ip", "user_agent", "created_at") SELECT "id", "send_id", "campaign_id", "contact_id", "event_type", "url", "ip", "user_agent", "created_at" FROM `tracking_events`;--> statement-breakpoint
DROP TABLE `tracking_events`;--> statement-breakpoint
ALTER TABLE `__new_tracking_events` RENAME TO `tracking_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;