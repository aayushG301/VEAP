import { col } from "../../config/db";
import { sha256 } from "../../security/crypto";

export interface AuditInput {
  userId: string; tokenId?: string | null; action: string; actor?: string | null; tier?: number | null;
  ip?: string | null; geo?: string | null; reason?: string | null; risk?: number | null; meta?: Record<string, unknown> | null;
}
const canonical = (r: any, createdAt: number) =>
  JSON.stringify([r.userId, r.tokenId ?? null, r.action, r.actor ?? null, r.tier ?? null, r.ip ?? null, r.geo ?? null, r.reason ?? null, r.risk ?? null, r.meta ?? null, createdAt]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One append attempt loop. `seq` is unique per owner (unique index), so two writers (even on different server instances)
 * can never fork the chain: the loser re-reads the head and retries, with a small random backoff to break ties.
 */
export async function appendAudit(e: AuditInput, maxAttempts = 40): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const last = await col.audit.find({ userId: e.userId }).sort({ seq: -1 }).limit(1).next();
    const prevHash = last?.hash ?? "GENESIS";
    const seq = (last?.seq ?? 0) + 1;
    const createdAt = Date.now();
    const meta = e.meta ? JSON.stringify(e.meta) : null;
    const hash = sha256(prevHash + canonical({ ...e, meta }, createdAt));
    try {
      await col.audit.insertOne({ userId: e.userId, seq, tokenId: e.tokenId ?? null, action: e.action, actor: e.actor ?? null, tier: e.tier ?? null, ip: e.ip ?? null, geo: e.geo ?? null, reason: e.reason ?? null, risk: e.risk ?? null, meta, prevHash, hash, createdAt });
      return;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      await sleep(Math.random() * Math.min(5 + attempt * 5, 120)); // someone else appended first
    }
  }
  throw new Error("audit log write contention");
}

// Within this process, writes for the same owner are serialised, so they rarely collide at all.
const queues = new Map<string, Promise<void>>();
export function writeAudit(e: AuditInput): Promise<void> {
  const prev = queues.get(e.userId) ?? Promise.resolve();
  const run = prev.then(() => appendAudit(e));
  const tail = run.catch(() => undefined);
  queues.set(e.userId, tail);
  void tail.then(() => { if (queues.get(e.userId) === tail) queues.delete(e.userId); });
  return run;
}

export async function verifyChain(userId: string): Promise<{ valid: boolean; count: number; brokenAtId?: number; head: string }> {
  const rows = await col.audit.find({ userId }).sort({ seq: 1 }).toArray();
  let prev = "GENESIS";
  let expectedSeq = 1;
  for (const r of rows) {
    const expected = sha256(prev + canonical({ userId: r.userId, tokenId: r.tokenId, action: r.action, actor: r.actor, tier: r.tier, ip: r.ip, geo: r.geo, reason: r.reason, risk: r.risk, meta: r.meta }, r.createdAt));
    if (r.seq !== expectedSeq || r.prevHash !== prev || r.hash !== expected) return { valid: false, count: rows.length, brokenAtId: r.seq, head: prev };
    prev = r.hash; expectedSeq++;
  }
  return { valid: true, count: rows.length, head: prev };
}
