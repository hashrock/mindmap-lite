# UI テスト用シナリオ（`/__scenarios`）

Chrome MCP などのブラウザ自動操作で UI を試すとき、毎回手で初期状態を作らなくて済むように、
**URL を開くだけで所定の初期状態が新規に作られ、その画面へリダイレクトされる** route を用意している。
実装は `app/scenarios/` にまとまっていて、`app/server.ts` は `app.route("/__scenarios", scenarioRoutes())` で mount するだけ。

## エンドポイント

| URL | 動き |
|---|---|
| `GET /__scenarios` | 一覧ページ。名前・説明・行き先・リンクと、いまのログイン状態を表示する |
| `GET /__scenarios/:name` | シナリオの初期状態を**毎回新規に**作り、テスト対象の画面へ `303` でリダイレクトする |
| `GET /__scenarios/:name?format=json`（または `Accept: application/json`） | リダイレクトせず、作成した ID・URL・ユーザーを JSON で返す |

未知の名前は `404`。未ログインなら HTML では一覧ページへ `303`（理由を表示）、JSON では `401` で `loginUrl` を返す。

## 安全性（本番でも公開してよい）

- **INSERT しかしない。** 既存のノート・公開・サイトを更新・削除する経路が無い（`app/scenarios/seed.ts`）。
- **自分のデータだけ。** シナリオは「いまログインしているユーザー」の新規データとして作られる。ノートのタイトルはすべて `scenario-<name>-<6桁ランダム>` で始まるので、あとから一覧で見分けて捨てられる。
- **認証を迂回しない。** セッションは通常の middleware が解決する。ローカルでは `DEV_BYPASS_AUTH` により Dev User でログイン済みになるので、そのまま使える。本番で使うなら先に Google でログインする。

## シナリオ一覧

| 名前 | 作られる状態 | 行き先 |
|---|---|---|
| `empty` | 空のトップレベルノード 1 つだけの非公開ノート（新規ノートの初期画面） | `/notes/:id/edit` |
| `typical` | text / link / image / markdown の各ノード、チェックボックス（済・未）、折りたたみ、太字・大きい文字、複数の木を持つノート。加えてピン留めノート 1 件・公開ノート 1 件 | `/notes/:id/edit` |
| `large` | 子 40 個の広い木、深さ 15 の木、長文（日本語・空白なしの長い単語・長い Markdown）、`position` で位置固定した木。加えて一覧を埋める 20 件（一部公開・長いタイトル） | `/notes/:id/edit` |
| `trash` | ゴミ箱に非公開 1 件・公開 1 件 | `/trash` |
| `public` | 公開ノート + 枝のノード公開。`/pub/:id.json` `/pub/:id.md` が生きていて、サイトはまだ無い（サイトエディタは下書き状態） | `/notes/:id`（閲覧ページ） |
| `site` | 公開ノート + ノード公開 + ビルド済みサイト。`/sites/:pubId` で配信され、サイトエディタは「公開済み」になる | `/sites/:pubId/edit` |

`site` の HTML/CSS は本物のビルド（ブラウザの Web Worker で JSX をコンパイル）ではなく、既定テンプレートと同じ構造をサーバー側で組み立てた静的な代替。`template` 列には本物の既定テンプレートが入っているので、エディタから再ビルド・再公開すると本物に置き換わる。

## Chrome MCP からの使い方

1. 開発サーバを起動する（`pnpm dev` → `http://localhost:5173`）。
2. JSON で状態を作り、ID と URL を受け取る：

   ```bash
   curl -s 'http://localhost:5173/__scenarios/site?format=json' | jq .
   ```

   ```json
   {
     "scenario": "site",
     "tag": "3f9a1c",
     "user": { "id": "dev-user", "email": "dev@localhost", "name": "Dev User" },
     "redirect": "http://localhost:5173/sites/<pubId>/edit",
     "notes": [{ "key": "main", "id": "…", "title": "scenario-site-3f9a1c", "isPublic": true, "editUrl": "…", "viewUrl": "…" }],
     "publications": [{ "id": "<pubId>", "jsonUrl": "…/pub/<pubId>.json", "markdownUrl": "…/pub/<pubId>.md", "siteEditUrl": "…" }],
     "sites": [{ "publicationId": "<pubId>", "url": "http://localhost:5173/sites/<pubId>", "editUrl": "…" }]
   }
   ```

3. ブラウザで `redirect`（または `notes[].editUrl` など任意の URL）を開いて操作する。
   ID を控える必要がなければ、ブラウザで直接 `http://localhost:5173/__scenarios/typical` を開くだけでよい。

`notes[].key` は計画内での役割（`main` / `pinned` / `public` / `list-1` …）で、同じシナリオを何度実行しても変わらない。

## シナリオを足すとき

1. `app/scenarios/fixtures.ts` に `build<Name>(ctx)` を書く（純粋関数。ID は `ctx.nextId()`、タイトルは `scenarioTitle(name, ctx.tag, …)`）。
2. `app/scenarios/catalog.ts` の `SCENARIO_NAMES` と `SCENARIOS` に追加する（`satisfies` で両方書くまでコンパイルが通らない）。
3. `app/scenarios/scenarios.test.ts` の共通テストが自動で走る。固有の期待があれば足す。
4. この表を更新する。

テスト: `pnpm vitest run --project node app/scenarios`
