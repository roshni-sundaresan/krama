import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone; `next start` (local) needs the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Monorepo root, so standalone output includes workspace packages.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  experimental: {
    serverActions: { bodySizeLimit: "20mb" }, // BA document uploads go through a server action
  },
};

export default nextConfig;
