@echo off
REM Local development server startup
REM SMTP and other credentials are loaded automatically from .env (see .env.example)

echo [Startup] Starting Node server (env loaded from .env)...
echo.

node server.js
