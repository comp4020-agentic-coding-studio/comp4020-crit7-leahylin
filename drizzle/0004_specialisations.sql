CREATE TABLE `specialisations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`code` text,
	`modelled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `specialisations_slug_unique` ON `specialisations` (`slug`);--> statement-breakpoint
ALTER TABLE `plans` ADD `specialisation_id` integer REFERENCES specialisations(id);--> statement-breakpoint
ALTER TABLE `requirements` ADD `specialisation_id` integer REFERENCES specialisations(id);