// PM2 Ecosystem Config — Ultron Mission Control Sentinel
// Auto-restarts Ultron (and optionally Jarvis) on crash
module.exports = {
  apps: [
    {
      name: 'ultron-frontend',
      cwd: '/Users/Tony1/Documents/Ultron',
      script: 'node_modules/.bin/next',
      args: 'dev --hostname 127.0.0.1 --port 3001',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: 'development',
        PORT: '3001',
      },
      error_file: '/Users/Tony1/Documents/Ultron/.data/logs/ultron-err.log',
      out_file: '/Users/Tony1/Documents/Ultron/.data/logs/ultron-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'jarvis-backend',
      cwd: '/Users/Tony1/Documents/Clawbot/backend',
      script: '/Users/Tony1/Documents/Clawbot/backend/venv/bin/python',
      args: '-m uvicorn main:app --host 127.0.0.1 --port 9472 --reload',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '/Users/Tony1/Documents/Ultron/.data/logs/jarvis-err.log',
      out_file: '/Users/Tony1/Documents/Ultron/.data/logs/jarvis-out.log',
      merge_logs: true,
      time: true,
    },
  ],
}
