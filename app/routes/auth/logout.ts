import { createRoute } from "honox/factory";
import { clearSession } from "../../utils/session";

export const GET = createRoute((c) => {
  clearSession(c);
  return c.redirect("/notes");
});
