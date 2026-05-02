# Checkers Game - Testing Guide

This document explains how to test the Checkers game application.

## Project Structure

The checkers game consists of:
- **Backend** (NestJS): Game logic, API, WebSocket server
- **Frontend** (Next.js): React web application
- **Database**: PostgreSQL for persistent data
- **Cache**: Redis for session management
- **Reverse Proxy**: Nginx for serving static files and proxying

## Testing Options

### 1. Unit Tests (Recommended for Development)

#### Backend Engine Tests
The core game logic has comprehensive unit tests:

```bash
cd backend
npm test
```

**Test Coverage:**
- Board initialization (Russian, International, English rules)
- Move validation and generation
- Piece capture mechanics
- Promotion to dama/queen
- Game over detection
- Position evaluation for AI
- AI move calculation (Minimax algorithm)

**Files:**
- `src/games/engine/checkers.engine.spec.ts` - Jest unit tests

#### Frontend Component Tests
Basic React component tests for the UI:

```bash
cd frontend
npm test
```

**Test Coverage:**
- Board rendering
- Piece display
- Move highlighting
- User interaction handling

**Files:**
- `src/components/board/CheckersBoard.test.tsx` - React Testing Library tests

### 2. Manual Testing Script

A standalone script to test core game functionality without running the full application:

```bash
cd backend
node test-game.js
```

This script demonstrates:
- Board setup
- Move generation
- Move execution
- Position evaluation
- AI move suggestions
- Win condition detection

### 3. Integration Testing (Full Application)

To test the complete application, you'll need to run all services:

#### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- PostgreSQL (or use Docker)
- Redis (or use Docker)

#### Environment Setup
1. Copy environment files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

2. Update database and Redis connection strings in `backend/.env`

#### Running the Full Stack
```bash
# Start all services
docker-compose up --build

# Or run individually:
# Backend (development)
cd backend && npm run start:dev

# Frontend (development)
cd frontend && npm run dev

# Database and Redis via Docker
docker-compose up postgres redis
```

#### Manual Testing Steps
1. **Open the application** at `http://localhost:3001`
2. **Register/Login** to create an account
3. **Create or join a game** from the dashboard
4. **Test gameplay**:
   - Move pieces by clicking
   - Verify captures work
   - Test promotion to dama
   - Check turn alternation
   - Test chat functionality
   - Verify game end detection

#### API Testing
Test the REST API endpoints:

```bash
# Get games list
curl http://localhost:3000/games

# Get user profile
curl http://localhost:3000/users/profile

# WebSocket testing (requires a WebSocket client)
# Connect to ws://localhost:3000 for game updates
```

### 4. Load Testing

For performance testing, you can use tools like Artillery:

```bash
npm install -g artillery
artillery run test/load-test.yml
```

## Test Scenarios

### Core Gameplay
- [ ] Initial board setup (12 pieces per player)
- [ ] Valid move generation
- [ ] Piece movement (diagonal only)
- [ ] Capture mechanics (jump over opponent)
- [ ] Multiple captures in one turn
- [ ] Promotion to dama/queen
- [ ] Turn alternation
- [ ] Win condition (no pieces or no moves)

### AI Features
- [ ] AI move suggestions
- [ ] Difficulty levels
- [ ] Position evaluation
- [ ] Minimax algorithm depth

### Multiplayer Features
- [ ] User registration/login
- [ ] Game creation
- [ ] Real-time updates via WebSocket
- [ ] Chat functionality
- [ ] Player ratings
- [ ] Tournament system

### UI/UX
- [ ] Board rendering
- [ ] Piece highlighting
- [ ] Move validation feedback
- [ ] Responsive design
- [ ] Accessibility

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Ensure PostgreSQL is running
- Check connection string in `.env`
- Run migrations: `npm run migration:run`

**Redis Connection Failed**
- Ensure Redis is running on port 6379
- Check Redis URL in `.env`

**WebSocket Connection Failed**
- Ensure backend is running on port 3000
- Check CORS settings
- Verify firewall settings

**Build Errors**
- Clear node_modules: `rm -rf node_modules && npm install`
- Check TypeScript compilation: `npm run build`

### Debug Mode
Run services in debug mode for detailed logging:

```bash
# Backend debug
npm run start:debug

# Frontend debug
npm run dev
```

## Performance Benchmarks

Expected performance for key operations:
- Move generation: < 10ms
- AI move calculation (depth 4): < 500ms
- Board evaluation: < 1ms
- WebSocket message handling: < 5ms

## Contributing

When adding new features:
1. Write unit tests first (TDD approach)
2. Update integration tests
3. Test manually with the full stack
4. Update this testing guide