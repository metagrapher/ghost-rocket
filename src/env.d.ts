/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type R2Bucket = import("@cloudflare/workers-types").R2Bucket;
type D1Database = import("@cloudflare/workers-types").D1Database;
type DurableObjectNamespace = import("@cloudflare/workers-types").DurableObjectNamespace;

interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    AI: any;
    BROWSER: any;
    GUN_RELAY: DurableObjectNamespace;
    CRON_SECRET?: string;
}

// Global augmentation for Hono env
declare namespace App {
    interface Locals extends Env { }
}
