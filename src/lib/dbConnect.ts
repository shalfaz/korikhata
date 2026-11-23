import mongoose, { Mongoose } from "mongoose";

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!globalThis.mongooseCache) {
  globalThis.mongooseCache = cached;
}

/**
 * Checks whether a MongoDB connection URI already specifies a database name
 * in its path (e.g., mongodb+srv://.../korikhata vs mongodb+srv://host.mongodb.net).
 */
function hasDatabaseNameInUri(uri: string): boolean {
  try {
    const withoutQuery = uri.split("?")[0];
    const schemeEnd = withoutQuery.indexOf("://");
    if (schemeEnd === -1) return false;
    const afterHost = withoutQuery.slice(schemeEnd + 3);
    const slashIndex = afterHost.indexOf("/");
    if (slashIndex === -1) return false;
    const dbPath = afterHost.slice(slashIndex + 1).trim();
    return dbPath.length > 0;
  } catch {
    return false;
  }
}

/**
 * Establishes and caches a singleton MongoDB connection via Mongoose.
 * Automatically targets the "korikhata" database if MONGODB_URI omits a database name.
 */
export async function dbConnect(): Promise<Mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI?.trim();

  if (!MONGODB_URI) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Please define it in .env.local."
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const explicitDbName = process.env.MONGODB_DB_NAME?.trim();
    const fallbackDbName = hasDatabaseNameInUri(MONGODB_URI)
      ? undefined
      : "korikhata";

    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      ...(explicitDbName || fallbackDbName
        ? { dbName: explicitDbName || fallbackDbName }
        : {}),
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => mongooseInstance);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default dbConnect;
