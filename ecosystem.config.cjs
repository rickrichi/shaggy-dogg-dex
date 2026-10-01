// ecosystem.config.cjs
// PM2 Process Manager Configuration for 24/7 Arbitrage Bot Daemon
module.exports = {
  apps: [
    {
      name: "shaggy-arbitrage-bot",
      script: "scripts/arbitrage-bot-daemon.ts",
      interpreter: "node_modules/.bin/tsx",
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 4000,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
