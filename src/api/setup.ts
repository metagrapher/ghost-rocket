import { beforeAll } from 'vitest'
import { env } from 'cloudflare:test'

beforeAll(async () => {
    // TEST_MIGRATIONS and DB are passed via vitest.config.ts bindings/mocks
    const migrationsArr = (env as any).TEST_MIGRATIONS as { sql: string }[]
    const db = (env as any).DB as any

    if (migrationsArr && db) {
        for (const migration of migrationsArr as any) {
            if (migration.queries) {
                for (const query of migration.queries) {
                    await db.prepare(query).run()
                }
            }
        }
    } else {
        console.warn('Missing TEST_MIGRATIONS or DB binding in setup.')
    }
})
