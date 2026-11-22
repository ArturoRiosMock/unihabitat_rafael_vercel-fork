import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.20"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "maps.geoapify.com", pathname: "/**" },
      { protocol: "https", hostname: "staticmap.openstreetmap.de", pathname: "/**" },
    ],
  },
};

export default nextConfig;
