/**
 * 各シナリオの計画を組み立てる純粋関数。DB・Hono に依存しない。
 *
 * 木はドメインの `MindMapModel` をそのまま組み立て、`ensureTopLevelNode` で
 * 「トップレベルノードを 1 つ以上」の不変条件を守る（CLAUDE.md）。
 */
import { ensureTopLevelNode, type IdSource, type MindMapModel } from "../domain/model";
import { toSiteNode } from "../application/siteNode";
import { inferSchema, shapeRecords, defaultTemplate } from "../application/siteSchema";
import type { SiteBuild } from "../application/siteTemplate";
import { scenarioTitle, type PlannedNote, type ScenarioContext, type ScenarioPlan } from "./plan";

// --- 木の組み立て ---

type NodeExtra = Omit<MindMapModel, "id" | "text" | "children">;

function node(nextId: IdSource, text: string, children: MindMapModel[] = [], extra: NodeExtra = {}): MindMapModel {
  return { id: nextId(), text, children, ...extra };
}

/** ルート＝ノートのタイトル（描画されない。CLAUDE.md「invisible root」）。 */
function root(nextId: IdSource, title: string, trees: MindMapModel[]): MindMapModel {
  return ensureTopLevelNode({ id: nextId(), text: title, children: trees }, nextId);
}

function plannedNote(
  key: string,
  nextId: IdSource,
  title: string,
  trees: MindMapModel[],
  flags: Partial<Pick<PlannedNote, "isPublic" | "pinned" | "trashed">> = {}
): PlannedNote {
  return {
    key,
    id: nextId(),
    title,
    model: root(nextId, title, trees),
    isPublic: flags.isPublic ?? false,
    pinned: flags.pinned ?? false,
    trashed: flags.trashed ?? false,
  };
}

/** 外部へ取りに行かない画像（160x90 の SVG data URI）。image ノードの描画確認用。 */
export const INLINE_IMAGE_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#0f766e"/><circle cx="80" cy="45" r="28" fill="#99f6e4"/></svg>'
  );

const SAMPLE_MARKDOWN = `## 議事メモ

- 決定: 来週リリース
- 保留: **ログイン画面**の文言

\`\`\`ts
const answer = 42;
\`\`\`
`;

// --- シナリオ ---

/** まっさら：空のトップレベルノード 1 つだけの新規ノート。 */
export function buildEmpty({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const main = plannedNote("main", nextId, scenarioTitle("empty", tag), []);
  return { notes: [main], publications: [], sites: [], redirect: `/notes/${main.id}/edit` };
}

/** ふつうの利用状態：全ノード種別・チェックボックス・折りたたみ・複数の木 + 一覧に並ぶ数件のノート。 */
export function buildTypical({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const main = plannedNote("main", nextId, scenarioTitle("typical", tag), [
    node(nextId, "プロジェクト計画", [
      node(
        nextId,
        "目標",
        [node(nextId, "9 月中にベータ公開"), node(nextId, "初週で 100 ユーザー")],
        { bold: true, fontSize: 18 }
      ),
      node(nextId, "タスク", [
        node(nextId, "要件をまとめる", [], { checked: true }),
        node(nextId, "画面を作る", [], { checked: false }),
        node(nextId, "テストを書く", [], { checked: false }),
      ]),
      node(nextId, "参考", [
        node(nextId, "https://example.com/", [], { type: "link", linkTitle: "Example Domain" }),
        node(nextId, INLINE_IMAGE_URL, [], { type: "image" }),
        node(nextId, SAMPLE_MARKDOWN, [], { type: "markdown" }),
      ]),
    ]),
    node(nextId, "アイデア（折りたたみ済み）", [node(nextId, "隠れている子 1"), node(nextId, "隠れている子 2")], {
      collapsed: true,
    }),
  ]);
  const pinned = plannedNote(
    "pinned",
    nextId,
    scenarioTitle("typical", tag, "(pinned)"),
    [node(nextId, "ピン留めされたノート", [node(nextId, "一覧の先頭に出る")])],
    { pinned: true }
  );
  const publicNote = plannedNote(
    "public",
    nextId,
    scenarioTitle("typical", tag, "(public)"),
    [node(nextId, "公開ノート", [node(nextId, "ログインなしで /notes/:id が見える")])],
    { isPublic: true }
  );
  return {
    notes: [main, pinned, publicNote],
    publications: [],
    sites: [],
    redirect: `/notes/${main.id}/edit`,
  };
}

export const LARGE_WIDE_CHILDREN = 40;
export const LARGE_DEPTH = 15;
export const LARGE_LIST_NOTES = 20;

const LONG_JA =
  "この文はレイアウトの折り返しを確認するための長い文章で、句読点をほとんど含まずに延々と続くことでノードの幅の上限と行送りが正しく働くかを試すものです。".repeat(3);
const LONG_TOKEN = "Supercalifragilisticexpialidocious".repeat(8);

/** 件数が多い・深い・長文：広い木、深い木、長文と長い Markdown、位置固定の木、一覧を埋める多数のノート。 */
export function buildLarge({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const wide = node(
    nextId,
    "広い木",
    Array.from({ length: LARGE_WIDE_CHILDREN }, (_, i) =>
      node(nextId, `項目 ${String(i + 1).padStart(2, "0")}`, [node(nextId, "詳細 a"), node(nextId, "詳細 b")])
    )
  );

  let deep = node(nextId, `深さ ${LARGE_DEPTH}`);
  for (let d = LARGE_DEPTH - 1; d >= 1; d--) deep = node(nextId, `深さ ${d}`, [deep]);

  const longText = node(nextId, "長文", [
    node(nextId, LONG_JA),
    node(nextId, LONG_TOKEN),
    node(nextId, SAMPLE_MARKDOWN.repeat(6), [], { type: "markdown" }),
  ]);

  const placed = node(nextId, "位置固定の木", [node(nextId, "position を持つトップレベルノード")], {
    position: { x: 1200, y: 40 },
  });

  const main = plannedNote("main", nextId, scenarioTitle("large", tag), [wide, deep, longText, placed]);
  const filler = Array.from({ length: LARGE_LIST_NOTES }, (_, i) =>
    plannedNote(
      `list-${i + 1}`,
      nextId,
      scenarioTitle("large", tag, `#${String(i + 1).padStart(2, "0")} ${i % 3 === 0 ? LONG_TOKEN.slice(0, 80) : "list filler"}`),
      [node(nextId, `一覧を埋めるノート ${i + 1}`)],
      { isPublic: i % 4 === 0 }
    )
  );
  return {
    notes: [main, ...filler],
    publications: [],
    sites: [],
    redirect: `/notes/${main.id}/edit`,
  };
}

/** ゴミ箱：削除済みノートが 2 件（非公開 / 公開）。 */
export function buildTrash({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const privateNote = plannedNote(
    "private",
    nextId,
    scenarioTitle("trash", tag, "(private)"),
    [node(nextId, "ゴミ箱の非公開ノート", [node(nextId, "復元できる")])],
    { trashed: true }
  );
  const publicNote = plannedNote(
    "public",
    nextId,
    scenarioTitle("trash", tag, "(public)"),
    [node(nextId, "ゴミ箱の公開ノート", [node(nextId, "ゴミ箱に入ると公開 URL も 404")])],
    { trashed: true, isPublic: true }
  );
  return { notes: [privateNote, publicNote], publications: [], sites: [], redirect: "/trash" };
}

/** 公開サイト向けの枝：2 階層目 = レコード、3 階層目 = フィールド（説明・URL・画像・タグ）。 */
function catalogBranch(nextId: IdSource, count: number): MindMapModel {
  return node(
    nextId,
    "おすすめの道具",
    Array.from({ length: count }, (_, i) =>
      node(nextId, `道具 ${i + 1}`, [
        node(nextId, `${i + 1} 番目の道具の説明。短い一文で特徴を述べる。`),
        node(nextId, `https://example.com/tools/${i + 1}`, [], { type: "link" }),
        node(nextId, INLINE_IMAGE_URL, [], { type: "image" }),
        node(nextId, "タグ", [node(nextId, "定番"), node(nextId, i % 2 ? "屋外" : "屋内")]),
      ])
    )
  );
}

/** 公開ノート + 枝のノード公開（/pub/:id.json・.md）。サイトはまだ無い。 */
export function buildPublic({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const branch = catalogBranch(nextId, 3);
  const main = plannedNote(
    "main",
    nextId,
    scenarioTitle("public", tag),
    [node(nextId, "公開ノート", [node(nextId, "この枝はノード公開されている →")]), branch],
    { isPublic: true }
  );
  const publication = { id: nextId(), noteId: main.id, nodeId: branch.id };
  return { notes: [main], publications: [publication], sites: [], redirect: `/notes/${main.id}` };
}

/** 公開済みサイト：公開ノート + ノード公開 + ビルド済みサイト（/sites/:pubId で配信される）。 */
export function buildSite({ tag, nextId }: ScenarioContext): ScenarioPlan {
  const branch = catalogBranch(nextId, 6);
  const main = plannedNote("main", nextId, scenarioTitle("site", tag), [branch], { isPublic: true });
  const publication = { id: nextId(), noteId: main.id, nodeId: branch.id };
  const site = { publicationId: publication.id, ...buildStaticSite(branch) };
  return {
    notes: [main],
    publications: [publication],
    sites: [site],
    redirect: `/sites/${publication.id}/edit`,
  };
}

// --- サイトのビルド（サーバー側の代替） ---

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;"
  );
}

/**
 * 本物のビルドはブラウザの Web Worker でしか走らない（siteTemplate.ts 冒頭）ので、
 * シナリオでは既定テンプレート（`defaultTemplate`）と同じ構造の HTML をサーバーで
 * 直接組み立てる。`data-card` / `data-search` の契約（検索スクリプト）は守る。
 * template 列には本物の既定テンプレートを入れるので、エディタを開けば
 * そのまま再ビルド・再公開できる。
 */
export function buildStaticSite(branch: MindMapModel): SiteBuild & { template: string; schema: string } {
  const data = toSiteNode(branch);
  const schema = inferSchema(data);
  const { items } = shapeRecords(data, schema);
  const cards = items
    .map((item) => {
      const fields = schema
        .map((f) => {
          const v = item[f.key];
          if (v === undefined) return "";
          if (Array.isArray(v)) return v.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
          if (f.type === "image") return `<img src="${escapeHtml(v)}" alt="">`;
          if (f.type === "link") return `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>`;
          return `<p>${escapeHtml(v)}</p>`;
        })
        .join("");
      return `<article data-card class="card"><h2>${escapeHtml(item.title)}</h2>${fields}</article>`;
    })
    .join("");
  const html =
    `<main class="page"><h1>${escapeHtml(branch.text)}</h1>` +
    `<input data-search placeholder="検索…" class="search">` +
    `<div class="grid">${cards}</div></main>`;
  const css =
    "body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}" +
    ".page{min-height:100vh;padding:24px}.search{margin-top:16px;width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px}" +
    ".grid{display:grid;gap:16px;margin-top:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}" +
    ".card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px}.card h2{margin:0 0 8px;font-size:16px}" +
    ".card p{margin:0 0 8px;color:#475569;font-size:14px}.card img{width:100%;max-height:12rem;object-fit:cover;border-radius:8px}" +
    ".card a{color:#047857;word-break:break-all}.tag{display:inline-block;margin:4px 4px 0 0;background:#f1f5f9;border-radius:4px;padding:2px 6px;font-size:12px;color:#475569}";
  return { template: defaultTemplate(schema), schema: "", html, css };
}
