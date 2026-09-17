// Shared edge proxy helper to forward requests to the Hono backend

const rawBackend =
  process.env.API_URL ||
  process.env.VITE_API_URL ||
  'http://localhost:8788'

const backendBase = rawBackend.replace(/\/+$/, '')

interface ProxyOptions {
  readonly forwardSearch?: boolean
  readonly cacheControl?: string
}

const isSafeMethod = (method: string): boolean =>
  method === 'GET' || method === 'HEAD'

export function backendUrl(path: string, search = ''): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const url = new URL(normalized, backendBase)
  if (search) url.search = search
  return url.toString()
}

export async function forwardToBackend(
  req: Request,
  path: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const url = new URL(req.url)
  const target = backendUrl(path, options.forwardSearch === false ? '' : url.search)

  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
    body: isSafeMethod(req.method) ? undefined : req.body,
    redirect: 'manual',
    cache: 'no-store',
  }

  try {
    const upstream = await fetch(target, init)
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: new Headers(upstream.headers),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ success: false, error: `upstream_unreachable:${message}` }),
      {
        status: 502,
        headers: {
          'content-type': 'application/json',
          'cache-control': options.cacheControl ?? 'no-store',
        },
      },
    )
  }
}
