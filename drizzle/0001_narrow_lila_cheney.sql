CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`units` integer NOT NULL,
	`level` integer NOT NULL,
	`subject` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_items_plan_id_course_id_unique` ON `plan_items` (`plan_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);--> statement-breakpoint
CREATE TABLE `requirement_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requirement_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`role` text DEFAULT 'include' NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirement_courses_requirement_id_course_id_role_unique` ON `requirement_courses` (`requirement_id`,`course_id`,`role`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`detail` text,
	`required_units` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`subjects` text,
	`min_level` integer,
	`max_level` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_key_unique` ON `requirements` (`key`);