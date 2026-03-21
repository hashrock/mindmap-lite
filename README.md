# Mindmap Lite

テキストのインデントからマインドマップを生成するWebアプリ。

## 構成

- `api/` — Hono API サーバー (Cloudflare Workers + D1)
- `web/` — Vite + React SPA (Konva でマインドマップ描画)

## 開発

```bash
# 依存関係インストール
cd api && pnpm install
cd ../web && pnpm install

# DBマイグレーション（初回のみ）
cd ../api && pnpm run migrate

# 起動（2ターミナル）
cd api && pnpm run dev    # http://localhost:8787
cd web && pnpm run dev    # http://localhost:5173 → APIにプロキシ
```

ブラウザで `http://localhost:5173` を開く。

### 認証バイパス（ローカル開発）

`api/.dev.vars` に `DEV_BYPASS_AUTH=1` を設定すると、Google OAuth をスキップして Dev User として自動ログインする。

## デプロイ

```bash
cd web && pnpm run build        # web/dist/ を生成
cd ../api && pnpm run deploy    # Workers + SPA 静的ファイル配信
```

Cloudflare Workers の `assets` 設定で `web/dist/` を配信し、SPA ルーティングは `not_found_handling: "single-page-application"` で処理。

## 技術スタック

- **API**: Hono, Drizzle ORM, Cloudflare D1 (SQLite)
- **Web**: React, Vite, Konva, Tailwind CSS v4
- **認証**: Google OAuth (@hono/oauth-providers)
