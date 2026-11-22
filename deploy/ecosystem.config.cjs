module.exports = {
  apps: [
    {
      name: 'salonpro-api',
      cwd: __dirname + '/../server',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/index.ts',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_memory_restart: '400M',
      time: true,
    },
  ],
};