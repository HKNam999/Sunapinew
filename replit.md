# TaiXiu WebSocket API

## Overview
A Node.js WebSocket client and API server for the TaiXiu (dice) game. The server connects to an external WebSocket to receive real-time game data and provides REST API endpoints for history, current session, and prediction data.

## Project Structure
- `index.js` - Main server file with WebSocket client and Express API
- `package.json` - Node.js dependencies and scripts

## API Endpoints
- `GET /api/his` - Returns formatted dice game history
- `GET /api/sun` - Returns latest session data
- `GET /api/predic` - Returns prediction for next session using the TaiXiu algorithm

## Running the Server
```bash
npm start
```

The server runs on port 5000.

## Dependencies
- express - Web server framework
- ws - WebSocket client library
- axios - HTTP client
- cors - Cross-Origin Resource Sharing middleware

## Recent Changes
- January 2026: Initial import and setup in Replit environment
