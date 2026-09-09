/**
 * ルートの判断とレスポンスの形（純粋関数）。Hono に触るのは index.ts だけ。
 */
import type { SessionUser } from "../user";
import { findScenario, type ScenarioDefinition } from "./catalog";
import type { ScenarioPlan } from "./plan";

/** `?format=json` か `Accept: application/json` なら JSON。ブラウザの既定 Accept には含まれない。 */
export function wantsJson(format: string | undefined, accept: string | undefined): boolean {
  return format === "json" || /\bapplication\/json\b/i.test(accept ?? "");
}

export type ScenarioAccess =
  | { kind: "unknown" }
  /** 認証は迂回しない：未ログインなら通常のログイン導線へ（docs 参照）。 */
  | { kind: "login-required"; scenario: ScenarioDefinition }
  | { kind: "run"; scenario: ScenarioDefinition; user: SessionUser };

export function resolveScenarioAccess(name: string, user: SessionUser | null): ScenarioAccess {
  const scenario = findScenario(name);
  if (!scenario) return { kind: "unknown" };
  if (!user) return { kind: "login-required", scenario };
  return { kind: "run", scenario, user };
}

export const LOGIN_PATH = "/auth/google";
export const SCENARIOS_PATH = "/__scenarios";

/** JSON 応答。Chrome MCP が作った状態を辿れるように、ID と絶対 URL を全部出す。 */
export interface ScenarioResult {
  scenario: string;
  description: string;
  tag: string;
  user: { id: string; email: string; name: string };
  /** ブラウザで開くとリダイレクトされる先（絶対 URL）。 */
  redirect: string;
  notes: {
    key: string;
    id: string;
    title: string;
    isPublic: boolean;
    pinned: boolean;
    trashed: boolean;
    editUrl: string;
    viewUrl: string;
  }[];
  publications: {
    id: string;
    noteId: string;
    nodeId: string;
    jsonUrl: string;
    markdownUrl: string;
    siteEditUrl: string;
  }[];
  sites: { publicationId: string; url: string; editUrl: string }[];
}

export function describePlan(
  scenario: ScenarioDefinition,
  plan: ScenarioPlan,
  tag: string,
  user: SessionUser,
  origin: string
): ScenarioResult {
  const abs = (path: string) => `${origin.replace(/\/+$/, "")}${path}`;
  return {
    scenario: scenario.name,
    description: scenario.description,
    tag,
    user: { id: user.id, email: user.email, name: user.name },
    redirect: abs(plan.redirect),
    notes: plan.notes.map((n) => ({
      key: n.key,
      id: n.id,
      title: n.title,
      isPublic: n.isPublic,
      pinned: n.pinned,
      trashed: n.trashed,
      editUrl: abs(`/notes/${n.id}/edit`),
      viewUrl: abs(`/notes/${n.id}`),
    })),
    publications: plan.publications.map((p) => ({
      id: p.id,
      noteId: p.noteId,
      nodeId: p.nodeId,
      jsonUrl: abs(`/pub/${p.id}.json`),
      markdownUrl: abs(`/pub/${p.id}.md`),
      siteEditUrl: abs(`/sites/${p.id}/edit`),
    })),
    sites: plan.sites.map((s) => ({
      publicationId: s.publicationId,
      url: abs(`/sites/${s.publicationId}`),
      editUrl: abs(`/sites/${s.publicationId}/edit`),
    })),
  };
}
