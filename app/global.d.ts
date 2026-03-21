import type {} from "hono";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
};

declare module "hono" {
  interface Env {
    Variables: {
      user: SessionUser | null;
    };
    Bindings: {
      DB: D1Database;
      GOOGLE_ID: string;
      GOOGLE_SECRET: string;
      SESSION_SECRET: string;
      DEV_BYPASS_AUTH?: string;
    };
  }
}
