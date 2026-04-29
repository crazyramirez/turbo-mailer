PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_list_contacts` (
	`list_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	PRIMARY KEY(`list_id`, `contact_id`),
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_list_contacts`("list_id", "contact_id") SELECT "list_id", "contact_id" FROM `list_contacts`;--> statement-breakpoint
DROP TABLE `list_contacts`;--> statement-breakpoint
ALTER TABLE `__new_list_contacts` RENAME TO `list_contacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;