CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text,
  `avatar_url` text,
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE TABLE `notes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES `users`(`id`),
  `title` text NOT NULL DEFAULT 'Untitled',
  `content` text NOT NULL DEFAULT '',
  `is_public` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
