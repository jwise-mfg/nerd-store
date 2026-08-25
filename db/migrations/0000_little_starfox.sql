CREATE TABLE `cart_items` (
	`cart_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`cart_id`, `variant_id`),
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`variant_id` text,
	`sku` text NOT NULL,
	`title_snapshot` text NOT NULL,
	`attributes_snapshot` text DEFAULT '{}' NOT NULL,
	`serial_snapshot` text,
	`qty` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`order_number` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`shipping_rate_code` text NOT NULL,
	`shipping_address` text NOT NULL,
	`stripe_payment_intent_id` text,
	`placed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_tenant_number_idx` ON `orders` (`tenant`,`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_pi_idx` ON `orders` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `orders_tenant_status_idx` ON `orders` (`tenant`,`status`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description_md` text DEFAULT '' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`position` integer DEFAULT 100 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_tenant_slug_idx` ON `products` (`tenant`,`slug`);--> statement-breakpoint
CREATE INDEX `products_tenant_status_idx` ON `products` (`tenant`,`status`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`variant_id` text NOT NULL,
	`cart_id` text NOT NULL,
	`qty` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reservations_variant_idx` ON `reservations` (`variant_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_cart_variant_idx` ON `reservations` (`cart_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`carrier` text NOT NULL,
	`tracking_code` text,
	`tracking_url` text,
	`shipped_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `variants` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`attributes` text DEFAULT '{}' NOT NULL,
	`price_cents` integer NOT NULL,
	`compare_at_cents` integer,
	`stock_qty` integer DEFAULT 0 NOT NULL,
	`weight_grams` integer DEFAULT 0 NOT NULL,
	`condition` text,
	`serial` text,
	`condition_notes` text,
	`unit_images` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variants_tenant_sku_idx` ON `variants` (`tenant`,`sku`);--> statement-breakpoint
CREATE INDEX `variants_product_idx` ON `variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL
);
