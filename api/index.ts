/**
 * API Index - Shaggy Dogg DEX
 *
 * Lists all available API endpoints
 *
 * @runtime edge
 */

export const config = {
  runtime: 'edge',
}

interface ApiEndpoint {
  path: string
  method: string
  description: string
  example: string
}

export default async function handler(): Promise<Response> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.ORIGIN ?? 'http://localhost:5173')

  const endpoints: ApiEndpoint[] = [
    {
      path: '/api/health',
      method: 'GET',
      description: 'Health check (proxied to Hono backend /health)',
      example: `${baseUrl}/api/health`,
    },
    {
      path: '/api/prices',
      method: 'POST',
      description: 'Portfolio prices (proxied to Hono backend /prices)',
      example: `${baseUrl}/api/prices`,
    },
    {
      path: '/api/prices?symbol=ETH',
      method: 'GET',
      description: 'Single symbol price lookup (proxied to Hono backend /prices)',
      example: `${baseUrl}/api/prices?symbol=ETH`,
    },
    {
      path: '/api/quote',
      method: 'POST',
      description: 'Swap quote proxy to Hono backend /api/quote',
      example: `${baseUrl}/api/quote`,
    },
  ]

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shaggy Dogg DEX - API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      padding: 2rem;
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 3rem;
    }
    h1 {
      color: #667eea;
      margin-bottom: 0.5rem;
      font-size: 2.5rem;
    }
    .subtitle {
      color: #666;
      margin-bottom: 3rem;
      font-size: 1.1rem;
    }
    .endpoint {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border-radius: 8px;
    }
    .method {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: bold;
      font-size: 0.875rem;
      margin-right: 1rem;
    }
    .path {
      font-family: 'Courier New', monospace;
      color: #333;
      font-size: 1.1rem;
      font-weight: 500;
    }
    .description {
      color: #666;
      margin: 0.75rem 0;
    }
    .example {
      background: #2d3748;
      color: #68d391;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .example a {
      color: #68d391;
      text-decoration: none;
    }
    .example a:hover {
      text-decoration: underline;
    }
    .footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #666;
    }
    .badge {
      display: inline-block;
      background: #48bb78;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Shaggy Dogg DEX API</h1>
    <p class="subtitle">
      Production-ready Vercel Edge Functions for fast, global API access
      <span class="badge">LIVE</span>
    </p>

    ${endpoints
      .map(
        (endpoint) => `
      <div class="endpoint">
        <div>
          <span class="method">${endpoint.method}</span>
          <span class="path">${endpoint.path}</span>
        </div>
        <p class="description">${endpoint.description}</p>
        <div class="example">
          <a href="${endpoint.example}" target="_blank">${endpoint.example}</a>
        </div>
      </div>
    `
      )
      .join('')}

    <div class="footer">
      <p><strong>Features:</strong> Global edge deployment • CDN caching • CORS enabled • TypeScript</p>
      <p style="margin-top: 0.5rem;">Built with ❤️ for Shaggy Dogg DEX</p>
    </div>
  </div>
</body>
</html>
  `

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, s-maxage=3600',
    },
  })
}
