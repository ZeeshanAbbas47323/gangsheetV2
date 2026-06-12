/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // konva references the optional "canvas" package for Node environments;
    // it is not needed in the browser bundle.
    config.externals = [...(config.externals ?? []), { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
