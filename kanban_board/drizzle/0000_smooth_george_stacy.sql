CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`boardId` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`wipLimit` integer,
	`color` text DEFAULT '#6B7280' NOT NULL,
	FOREIGN KEY (`boardId`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`boardId` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`boardId`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`boardId` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6B7280' NOT NULL,
	FOREIGN KEY (`boardId`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `taskLabels` (
	`taskId` text NOT NULL,
	`labelId` text NOT NULL,
	FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`labelId`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`taskNumber` integer NOT NULL,
	`boardId` text NOT NULL,
	`columnId` text NOT NULL,
	`epicId` text,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`assignee` text,
	`estimatedTime` text,
	`position` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`boardId`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`columnId`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`epicId`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_taskNumber_unique` ON `tasks` (`taskNumber`);