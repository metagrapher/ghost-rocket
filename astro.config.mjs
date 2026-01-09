import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
// Lit integration removed to prevent SSR crash in Worker
// We use client-side only custom elements via script imports
import uno from 'unocss/astro'

export default defineConfig(
  {
    adapter: cloudflare()
    , integrations:
      [uno()
      ]
    , output: 'server'
    , server: { port: 6543 }
  })