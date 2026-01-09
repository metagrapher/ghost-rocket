import type { APIRoute } from 'astro'
import app from '../../api/index'

export const ALL: APIRoute = (
    { request
        , locals
    }
) => {
    const env = (locals as any).runtime?.env || {}
    return app.fetch(request, env)
}
