CREATE TABLE `login_attempts` (
	`ip` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`first_attempt` integer NOT NULL,
	`blocked_until` integer
);
