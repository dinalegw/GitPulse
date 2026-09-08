import type { MetadataRoute } from 'next';

const SITE_URL = 'https://start-gitpulse.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/docs', '/playground', '/connect'];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.7,
  }));
}
