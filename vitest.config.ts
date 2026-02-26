import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineWorkersConfig(async () => {
    const migrationsPath = path.resolve(__dirname, 'migrations')
    const migrations = await readD1Migrations(migrationsPath)

    return {
        test:
        {
            pool: '@cloudflare/vitest-pool-workers'
            , setupFiles: ['./src/api/setup.ts']
            , poolOptions:
            {
                workers:
                {
                    wrangler: { configPath: './wrangler.test.jsonc' }
                    , miniflare:
                    {
                        d1Databases: ['DB']
                        , r2Buckets: ['BUCKET']
                        , bindings: { TEST_MIGRATIONS: migrations }
                    }
                }
            }
            , include: ['src/api/**/*.test.ts']
        }
    }
})
