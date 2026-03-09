export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // Security check: Updated to require https://
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
