import type { APIRoute } from 'astro'
import app from '../../api/index'

export const ALL: APIRoute = (
    { request
        , locals
    }
) => {
    const runtime = (locals as any).runtime || {}
    return app.fetch(request, runtime.env || {}, runtime.ctx)
}
