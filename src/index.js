export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Intercept requests to our specific API endpoint
        if (url.pathname === '/api/bill') {
            const targetUrl = url.searchParams.get('url');

            // Security check
            if (!targetUrl || !targetUrl.startsWith('https://wslwebservices.leg.wa.gov/')) {
                return new Response('Unauthorized request', { status: 403 });
            }

            try {
                const response = await fetch(targetUrl);
                const text = await response.text();
                
                return new Response(text, {
                    status: response.status,
                    headers: {
                        'Content-Type': 'application/xml'
                    }
                });
            } catch (err) {
                return new Response(`Proxy Error: ${err.message}`, { status: 500 });
            }
        }

        // If the route doesn't match the API, return a 404. 
        // Note: Cloudflare automatically intercepts requests for static assets 
        // (like your index.html) before this script runs, so valid frontend 
        // requests will never hit this 404.
        return new Response("Not found", { status: 404 });
    }
};
