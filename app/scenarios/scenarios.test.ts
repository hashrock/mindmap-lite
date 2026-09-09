/**
 * シナリオ生成の契約：
 * - 全シナリオが「隔離された新規データ」の規約（タイトル接頭辞・ID 新規・FK 整合）を守る
 * - 木は永続化の往復（serialize → parseContent）で壊れず、ID が一意
 * - サイトのビルドは保存 API の検証（validateSiteSave）を通る
 * - ルートの判断（JSON 判定・アクセス・JSON 応答の形）
 */
import { describe, it, expect } from "vitest";
import { SCENARIO_NAMES, SCENARIOS, findScenario, listScenarios, type ScenarioName } from "./catalog";
import { LARGE_DEPTH, LARGE_LIST_NOTES, LARGE_WIDE_CHILDREN, buildStaticSite } from "./fixtures";
import { scenarioTitle, shortTag, type ScenarioContext, type ScenarioPlan } from "./plan";
import { describePlan, resolveScenarioAccess, wantsJson } from "./response";
import { parseContent, serializeModel } from "../application/persistence";
import { findNode, getNodeDepths, topLevelNodes, type MindMapModel } from "../domain/model";
import { validateSiteSave } from "../application/siteTemplate";

function sequentialIds(): ScenarioContext["nextId"] {
  let n = 0;
  return () => `id-${++n}`;
}

function buildAll(tag = "abc123"): Record<ScenarioName, ScenarioPlan> {
  const out = {} as Record<ScenarioName, ScenarioPlan>;
  for (const name of SCENARIO_NAMES) out[name] = SCENARIOS[name].build({ tag, nextId: sequentialIds() });
  return out;
}

function allIds(model: MindMapModel): string[] {
  return [model.id, ...model.children.flatMap(allIds)];
}

const user = { id: "u1", email: "u@example.com", name: "U", avatarUrl: "" };

describe("catalog", () => {
  it("has between 3 and 6 scenarios, each resolvable by name", () => {
    expect(listScenarios().length).toBeGreaterThanOrEqual(3);
    expect(listScenarios().length).toBeLessThanOrEqual(6);
    for (const s of listScenarios()) expect(findScenario(s.name)).toBe(s);
    expect(findScenario("nope")).toBeUndefined();
    expect(findScenario("constructor")).toBeUndefined();
  });
});

describe("every scenario plan", () => {
  const plans = buildAll();

  it("creates at least one note and redirects somewhere inside the app", () => {
    for (const [name, plan] of Object.entries(plans)) {
      expect(plan.notes.length, name).toBeGreaterThan(0);
      expect(plan.redirect, name).toMatch(/^\/[a-z]/);
    }
  });

  it("titles every note scenario-<name>-<tag> so the rows are recognisable", () => {
    for (const [name, plan] of Object.entries(plans)) {
      for (const n of plan.notes) expect(n.title, name).toMatch(new RegExp(`^scenario-${name}-abc123( |$)`));
    }
  });

  it("uses fresh, unique ids across notes, nodes, publications and sites", () => {
    for (const [name, plan] of Object.entries(plans)) {
      const ids = [
        ...plan.notes.map((n) => n.id),
        ...plan.notes.flatMap((n) => allIds(n.model)),
        ...plan.publications.map((p) => p.id),
      ];
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("keeps foreign keys inside the plan (publication → note/node, site → publication)", () => {
    for (const [name, plan] of Object.entries(plans)) {
      for (const p of plan.publications) {
        const note = plan.notes.find((n) => n.id === p.noteId);
        expect(note, `${name}: publication note`).toBeDefined();
        expect(findNode(note!.model, p.nodeId), `${name}: publication node`).not.toBeNull();
        expect(note!.isPublic, `${name}: only public notes can be published`).toBe(true);
        expect(note!.trashed, `${name}: trashed notes are not servable`).toBe(false);
      }
      for (const s of plan.sites) {
        expect(plan.publications.some((p) => p.id === s.publicationId), `${name}: site publication`).toBe(true);
      }
    }
  });

  it("survives the persistence round trip unchanged (well-formed tree, ≥1 top-level node)", () => {
    for (const [name, plan] of Object.entries(plans)) {
      for (const n of plan.notes) {
        const parsed = parseContent(serializeModel(n.model), n.title);
        expect(parsed, `${name}/${n.key}`).toEqual(n.model);
        expect(topLevelNodes(parsed).length, `${name}/${n.key}`).toBeGreaterThan(0);
        expect(parsed.text).toBe(n.title);
      }
    }
  });

  it("is deterministic given the same tag and id source", () => {
    expect(buildAll("t")).toEqual(buildAll("t"));
  });

  it("redirects to a note or site created by the plan", () => {
    for (const [name, plan] of Object.entries(plans)) {
      const known = [
        ...plan.notes.flatMap((n) => [`/notes/${n.id}/edit`, `/notes/${n.id}`]),
        ...plan.publications.map((p) => `/sites/${p.id}/edit`),
        "/trash",
      ];
      expect(known, name).toContain(plan.redirect);
    }
  });
});

describe("individual scenarios", () => {
  const plans = buildAll();

  it("empty: one private note with a single blank top-level node", () => {
    const { notes, publications, sites } = plans.empty;
    expect(notes).toHaveLength(1);
    expect(publications).toEqual([]);
    expect(sites).toEqual([]);
    expect(notes[0].isPublic).toBe(false);
    expect(topLevelNodes(notes[0].model)).toEqual([{ id: expect.any(String), text: "", children: [] }]);
  });

  it("typical: covers every node kind, a checkbox, a collapsed node, and pinned/public siblings", () => {
    const main = plans.typical.notes.find((n) => n.key === "main")!;
    const nodes = collect(main.model);
    for (const type of ["link", "image", "markdown"] as const) {
      expect(nodes.some((n) => n.type === type), type).toBe(true);
    }
    expect(nodes.some((n) => n.checked === true)).toBe(true);
    expect(nodes.some((n) => n.checked === false)).toBe(true);
    expect(nodes.some((n) => n.collapsed)).toBe(true);
    expect(nodes.some((n) => n.bold && n.fontSize)).toBe(true);
    expect(topLevelNodes(main.model).length).toBeGreaterThan(1);
    expect(plans.typical.notes.find((n) => n.key === "pinned")?.pinned).toBe(true);
    expect(plans.typical.notes.find((n) => n.key === "public")?.isPublic).toBe(true);
  });

  it("large: wide, deep, long, placed, and many notes in the list", () => {
    const main = plans.large.notes.find((n) => n.key === "main")!;
    const tops = topLevelNodes(main.model);
    expect(Math.max(...tops.map((t) => t.children.length))).toBe(LARGE_WIDE_CHILDREN);
    expect(Math.max(...getNodeDepths(main.model).values())).toBe(LARGE_DEPTH);
    expect(collect(main.model).some((n) => n.text.length >= 200)).toBe(true);
    expect(tops.some((t) => t.position)).toBe(true);
    expect(plans.large.notes).toHaveLength(1 + LARGE_LIST_NOTES);
  });

  it("trash: every note is trashed, both visibilities represented", () => {
    expect(plans.trash.notes.every((n) => n.trashed)).toBe(true);
    expect(plans.trash.notes.map((n) => n.isPublic).sort()).toEqual([false, true]);
    expect(plans.trash.redirect).toBe("/trash");
  });

  it("public: a publication on a branch of a public note, no site, opens the view page", () => {
    expect(plans.public.publications).toHaveLength(1);
    expect(plans.public.sites).toEqual([]);
    expect(plans.public.redirect).toBe(`/notes/${plans.public.notes[0].id}`);
  });

  it("site: a built site whose payload passes the save validation and keeps the search contract", () => {
    const [site] = plans.site.sites;
    expect(site.publicationId).toBe(plans.site.publications[0].id);
    expect(validateSiteSave({ template: site.template, schema: site.schema, html: site.html, css: site.css }).ok).toBe(
      true
    );
    expect(site.html).toContain("data-search");
    expect((site.html.match(/data-card/g) ?? []).length).toBe(6);
    expect(site.template).toContain("export default function Page()");
    expect(plans.site.redirect).toBe(`/sites/${site.publicationId}/edit`);
  });

  it("buildStaticSite escapes record text", () => {
    const branch: MindMapModel = {
      id: "b",
      text: "<t>",
      children: [{ id: "r", text: `x<script>"&`, children: [] }],
    };
    const { html } = buildStaticSite(branch);
    expect(html).not.toContain("<script>");
    expect(html).toContain("x&lt;script&gt;&quot;&amp;");
    expect(html).toContain("<h1>&lt;t&gt;</h1>");
  });
});

describe("plan helpers", () => {
  it("scenarioTitle prefixes and optionally suffixes", () => {
    expect(scenarioTitle("typical", "ab12cd")).toBe("scenario-typical-ab12cd");
    expect(scenarioTitle("typical", "ab12cd", "(pinned)")).toBe("scenario-typical-ab12cd (pinned)");
  });

  it("shortTag is 6 lowercase hex chars", () => {
    expect(shortTag(new Uint8Array([0, 255, 16]))).toBe("00ff10");
    expect(shortTag()).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe("route decisions", () => {
  it("wantsJson: query wins, Accept works, browsers' default Accept does not", () => {
    expect(wantsJson("json", undefined)).toBe(true);
    expect(wantsJson(undefined, "application/json")).toBe(true);
    expect(wantsJson(undefined, "text/html,application/xhtml+xml,*/*;q=0.8")).toBe(false);
    expect(wantsJson(undefined, undefined)).toBe(false);
  });

  it("resolveScenarioAccess: unknown → login-required → run", () => {
    expect(resolveScenarioAccess("nope", user)).toEqual({ kind: "unknown" });
    expect(resolveScenarioAccess("typical", null)).toMatchObject({ kind: "login-required" });
    expect(resolveScenarioAccess("typical", user)).toMatchObject({ kind: "run", user });
  });

  it("describePlan lists absolute URLs for everything the plan created", () => {
    const plan = SCENARIOS.site.build({ tag: "t", nextId: sequentialIds() });
    const out = describePlan(SCENARIOS.site, plan, "t", user, "http://localhost:5173/");
    expect(out.redirect).toBe(`http://localhost:5173${plan.redirect}`);
    expect(out.notes[0]).toMatchObject({
      id: plan.notes[0].id,
      editUrl: `http://localhost:5173/notes/${plan.notes[0].id}/edit`,
      viewUrl: `http://localhost:5173/notes/${plan.notes[0].id}`,
    });
    expect(out.publications[0].jsonUrl).toBe(`http://localhost:5173/pub/${plan.publications[0].id}.json`);
    expect(out.sites[0].url).toBe(`http://localhost:5173/sites/${plan.sites[0].publicationId}`);
    expect(out.user).toEqual({ id: "u1", email: "u@example.com", name: "U" });
    expect(JSON.stringify(out)).not.toContain("avatarUrl");
  });
});

function collect(model: MindMapModel): MindMapModel[] {
  return [model, ...model.children.flatMap(collect)];
}
