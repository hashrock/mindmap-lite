import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { SessionUser } from "../user";

type UserRow = typeof users.$inferSelect;

export async function findUserById(db: DrizzleD1Database, id: string): Promise<UserRow | null> {
  return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
}

export async function findUserByEmail(db: DrizzleD1Database, email: string): Promise<UserRow | null> {
  return (await db.select().from(users).where(eq(users.email, email)).get()) ?? null;
}

/**
 * The one INSERT into `users`, shared by the Google callback, the dev bypass
 * (Dev User) and the scenario route (throwaway users), so a new column has a
 * single place to land.
 */
export async function insertUser(
  db: DrizzleD1Database,
  user: SessionUser,
  createdAt: string = new Date().toISOString()
): Promise<void> {
  await db.insert(users).values({
    id: user.id,
    email: user.email,
    name: user.name || null,
    avatarUrl: user.avatarUrl || null,
    createdAt,
  });
}
