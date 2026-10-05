/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module: keep it out of the bundle, server-side only.
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
  agentRules: false,
};
export default nextConfig;
