// SERVER-ONLY. Never import this from a component or client-side file.
import type { MongoClient as MongoClientType, Db } from "mongodb";

let dnsConfigured = false;
let dbPromise: Promise<Db> | null = null;
let indexesEnsured = false;

async function connect(): Promise<Db> {
  const { MongoClient } = await import("mongodb");

  // Local-dev only DNS workaround (ISPs that fail SRV lookups). Never in prod.
  if (!dnsConfigured && process.env.NODE_ENV === "development") {
    const dns = await import("node:dns");
    dns.default.setServers(["8.8.8.8", "1.1.1.1"]);
    dnsConfigured = true;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const make = () =>
    new MongoClient(uri, {
      // Fail fast instead of hanging for 30s, and keep warm sockets so the
      // second click in the admin portal doesn't pay a fresh TLS handshake.
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 2,
      maxIdleTimeMS: 120000,
      retryReads: true,
      retryWrites: true,
    });

  let client: MongoClientType;
  if (process.env.NODE_ENV === "development") {
    // Survive HMR reloads.
    const g = global as any;
    if (!g._mongoClient) g._mongoClient = make();
    client = g._mongoClient;
  } else {
    client = make();
  }

  // Connect eagerly so every caller awaits the SAME in-flight connection
  // (previously concurrent first requests each raced the lazy connect).
  await client.connect();
  const db = client.db("Edurack");
  void ensureIndexes(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = connect().catch((err) => {
      // Don't cache a failed connect — let the next request try again.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Best-effort, once per server process. Indexes make the admin lists/aggregates
// (students, purchases, sessions, team) hit an index instead of scanning.
async function ensureIndexes(db: Db) {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const make = (col: string, spec: Record<string, 1 | -1>) =>
    db.collection(col).createIndex(spec, { background: true }).catch(() => {});
  await Promise.all([
    make("profiles", { createdAt: -1 }),
    make("profiles", { uid: 1 }),
    make("sessions", { uid: 1 }),
    make("purchases", { purchasedAt: -1 }),
    make("purchases", { uid: 1 }),
    make("purchases", { itemType: 1, itemId: 1 }),
    make("testAttempts", { uid: 1 }),
    make("teamMembers", { lastActiveAt: -1 }),
    make("teamMembers", { uid: 1 }),
    make("teamActivity", { kind: 1, at: -1 }),
    make("supportTickets", { uid: 1, createdAt: -1 }),
  ]);
}
