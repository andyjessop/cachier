interface Env {
  CACHIER_BUCKET: R2Bucket;
  CACHIER_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const apiKey = request.headers.get('x-cachier-api-key');

    if (apiKey !== env.CACHIER_API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.slice(1); // remove leading slash

    if (pathname.startsWith('assets')) {
      const key = pathname.slice('assets/'.length);
      switch (request.method) {
        case 'POST':
          await env.CACHIER_BUCKET.put(key, request.body);
          return new Response(`Put ${key} successfully!`);
        case 'GET':
          const object = await env.CACHIER_BUCKET.get(key);
  
          if (object === null) {
            return new Response('Object Not Found', { status: 404 });
          }
  
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
  
          return new Response(object.body, {
            headers,
          });
        case 'DELETE':
          await env.CACHIER_BUCKET.delete(key);
          return new Response('Deleted!');
  
        default:
          return new Response('Method Not Allowed', {
            status: 405,
            headers: {
              Allow: 'PUT, GET, DELETE',
            },
          });
      }
    }

    if (pathname.startsWith('list')) {
      const prefix = url.searchParams.get('prefix');

      if (!prefix) {
        return new Response('Bad Request', { status: 400 });
      }

      const objects = await env.CACHIER_BUCKET.list({ prefix });

      return new Response(JSON.stringify(objects));
    }
  },
};