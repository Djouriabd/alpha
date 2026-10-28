import { randomBytes } from "node:crypto";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    // Fallback session key, generated once per build and shared by every server instance of that
    // deployment. It is only referenced from server-only code, so it never reaches the browser.
    // Setting SESSION_SECRET is still preferred: it keeps people signed in across redeploys.
    BUILD_SESSION_KEY: randomBytes(32).toString("base64url"),
  },
};

export default nextConfig;
