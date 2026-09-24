// SERVER-ONLY. Never import this from a component or client-side file.
import type { MongoClient as MongoClientType, Db } from "mongodb";

let client: MongoClientType;
let db: Db;
let dnsConfigured = false;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const { MongoClient } = await import("mongodb");

  // The custom DNS resolvers were a local-dev workaround for ISPs that fail
  // SRV lookups on their default resolver. They must NOT run in production —
  // on Vercel this causes DNS/TLS mismatches against Atlas's SRV records,
  // leading to MongoServerSelectionError / TLS alert failures.
  if (!dnsConfigured && process.env.NODE_ENV === "development") {
    const dns = await import("node:dns");
    dns.default.setServers(["8.8.8.8", "1.1.1.1"]);
    dnsConfigured = true;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  // Standard singleton pattern for serverless environments
  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so the value is preserved
    // across module reloads caused by HMR (Hot Module Replacement).
    if (!(global as any)._mongoClient) {
      (global as any)._mongoClient = new MongoClient(uri);
    }
    client = (global as any)._mongoClient;
  } else {
    // In production mode, it's best to not use a global variable.
    if (!client) client = new MongoClient(uri);
  }

  db = client.db("Edurack");
  return db;
}