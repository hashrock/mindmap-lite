/**
 * 計画（ScenarioPlan）を D1 に書き込む。INSERT しかしない——既存行の更新・削除は
 * ここには存在しないので、本番で叩かれても他のデータに影響しない。
 *
 * 保存の作法は server.ts の `POST /notes` / publications / sites と同じ：
 * 非公開ノートは暗号化して保存し（`encodeNoteContentForStorage`）、
 * 公開ノートは平文。FK の順（notes → node_publications → sites）で入れる。
 */
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { notes, nodePublications, sites } from "../db/schema";
import { encodeNoteContentForStorage, noteStorageMode } from "../utils/crypto";
import { serializeModel } from "../application/persistence";
import type { ScenarioPlan } from "./plan";

export async function applyScenarioPlan(
  db: DrizzleD1Database,
  plan: ScenarioPlan,
  userId: string,
  encryptionKey: string,
  now: string = new Date().toISOString()
): Promise<void> {
  for (const n of plan.notes) {
    const content = await encodeNoteContentForStorage(
      serializeModel(n.model),
      noteStorageMode(n.isPublic),
      encryptionKey
    );
    await db.insert(notes).values({
      id: n.id,
      userId,
      title: n.title,
      content,
      isPublic: n.isPublic,
      pinned: n.pinned,
      deletedAt: n.trashed ? now : null,
      createdAt: now,
      updatedAt: now,
    });
  }
  for (const p of plan.publications) {
    await db.insert(nodePublications).values({
      id: p.id,
      userId,
      noteId: p.noteId,
      nodeId: p.nodeId,
      createdAt: now,
    });
  }
  for (const s of plan.sites) {
    await db.insert(sites).values({
      publicationId: s.publicationId,
      userId,
      template: s.template,
      schema: s.schema,
      html: s.html,
      css: s.css,
      updatedAt: now,
    });
  }
}
