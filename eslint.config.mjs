import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["scripts/**", "qa/**", "src/chat/data/**", "coverage/**"],
  },
];

export default config;
