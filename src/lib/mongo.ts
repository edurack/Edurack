// SERVER-ONLY. Never import this from a component or client-side file.
import { MongoClient, type Db } from "mongodb";
import dns from "node:dns";

// The custom DNS resolvers were a local-dev workaround for ISPs that fail
// SRV lookups on their default resolver. They must NOT run in production —
// on Vercel this causes DNS/TLS mismatches against Atlas's SRV records,
// leading to MongoServerSelectionError / TLS alert failures.
if (process.env.NODE_ENV === "development") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

let client: MongoClient;
let db: Db;

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
  client = new MongoClient(uri);
}

export async function getDb(): Promise<Db> {
  if (db) return db;

  // The driver will handle connecting automatically when you request the db context
  db = client.db("Edurack");
  return db;
}