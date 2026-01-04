# TaiXiu WebSocket API

## Overview
A Node.js Express server that connects to a TaiXiu game WebSocket and exposes API endpoints for game history data.

## Project Structure
- `index.js` - Main server file with Express API and WebSocket client
- `package.json` - Node.js dependencies

## Technology Stack
- Node.js 20
- Express.js for HTTP API
- ws library for WebSocket client
- axios for HTTP requests

## API Endpoints
- `GET /api/his` - Get full game history
- `GET /api/sun` - Get latest game result

## Running the Project
The server runs on port 5000 and automatically connects to the game WebSocket on startup.

```bash
npm start
```

## Configuration
- Server binds to 0.0.0.0:5000 for Replit compatibility
- WebSocket auto-reconnects on disconnect
