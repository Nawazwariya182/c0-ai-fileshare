module.exports = {
  apps: [
    {
      name: "p2p-signaling",
      script: "signaling-server/index.ts",
      interpreter: "tsx",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "p2p-nextjs",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
}
