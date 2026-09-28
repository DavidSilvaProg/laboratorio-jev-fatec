declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    KEY_ENCRYPTION_SECRET?: string;
  }
}
