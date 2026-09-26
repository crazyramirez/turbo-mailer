CREATE TABLE `send_payloads` (
	`send_id` integer PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text,
	`vars` text,
	`api_key_id` integer,
	`idempotency_key` text,
	FOREIGN KEY (`send_id`) REFERENCES `sends`(`id`) ON UPDATE no action ON DELETE cascade
);
