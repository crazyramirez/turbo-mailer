PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`contact_id` integer,
	`email` text NOT NULL,
	`personalized_subject` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	`error_msg` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_sends`("id", "campaign_id", "contact_id", "email", "personalized_subject", "status", "sent_at", "error_msg") SELECT "id", "campaign_id", "contact_id", "email", "personalized_subject", "status", "sent_at", "error_msg" FROM `sends`;--> statement-breakpoint
DROP TABLE `sends`;--> statement-breakpoint
ALTER TABLE `__new_sends` RENAME TO `sends`;--> statement-breakpoint
PRAGMA foreign_keys=ON;