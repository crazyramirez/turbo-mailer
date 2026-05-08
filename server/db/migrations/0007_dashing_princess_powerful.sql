CREATE TABLE `refresh_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
