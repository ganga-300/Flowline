/** @type {import('next').NextConfig} */
const nextConfig = {
  // "Zaps" were renamed to "Flows": old links (bookmarks, emails, alerts) keep working.
  async redirects() {
    return [{ source: "/zaps/:path*", destination: "/flows/:path*", permanent: true }];
  },
};

export default nextConfig;
