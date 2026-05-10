import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "lucide-react$": path.resolve(process.cwd(), "node_modules/lucide-react/dist/cjs/lucide-react.js"),
      "framer-motion$": path.resolve(process.cwd(), "node_modules/framer-motion/dist/cjs/index.js"),
      "@reduxjs/toolkit$": path.resolve(process.cwd(), "node_modules/@reduxjs/toolkit/dist/redux-toolkit.legacy-esm.js"),
    };

    return config;
  },
};

export default nextConfig;
