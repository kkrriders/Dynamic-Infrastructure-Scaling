# Dynamic Infrastructure Scaling Dashboard

A dashboard application for monitoring and controlling dynamic infrastructure scaling on Azure with Ollama models.

## Backend Integration

This dashboard is designed to connect to a backend API. To connect it to your backend, follow these steps:

1. Create a `.env.local` file in the root directory with the following variables:
   ```
   # Backend API URL
   NEXT_PUBLIC_API_URL=http://your-backend-url/api  # Replace with your actual backend URL
   
   # Environment (development/production)
   NODE_ENV=development  # or production in prod environments
   ```

2. Your backend API should implement the following endpoints:

   **Authentication:**
   - `POST /api/auth/login` - Login endpoint accepting email and password, returning user data and JWT token
   - `POST /api/auth/logout` - Logout endpoint
   - `GET /api/auth/validate` - Token validation endpoint

   **Metrics and Status:**
   - `GET /api/metrics` - Fetch current metrics data
   - `GET /api/scaling` - Fetch current scaling status
   - `GET /api/model` - Fetch current model status
   - `GET /api/logs` - Fetch scaling action logs

   **Configuration:**
   - `POST /api/config/azure` - Update Azure configuration
   - `POST /api/config/ollama` - Update Ollama configuration
   - `POST /api/config/scaling` - Update scaling configuration
   - `POST /api/scaling/manual` - Apply manual scaling
   - `POST /api/scaling/check` - Force scaling check

3. Authentication should return a JWT token that the dashboard will include in all subsequent requests.

## Mock Mode for Development

In development mode, the dashboard uses mock data by default, allowing you to test the UI without setting up a backend. This is controlled by:

1. **Environment:** When `NODE_ENV=development`, mock mode is enabled by default
2. **Toggle in UI:** You can switch between mock and real data using the "Test Real Backend" / "Switch to Mock Mode" button in the Backend Status component

Mock data provides simulated:
- CPU, memory, and network metrics with historical data
- Scaling status and recommendations
- Model status
- Action logs
- Configuration operations

This allows you to develop and test the UI without having a working backend.

## Testing Backend Integration

A Backend Status component has been added to the dashboard to help you test the integration with your backend:

1. On the main dashboard and manual scaling pages, you'll see a Backend Connectivity Test card
2. This component automatically tests connections to all required API endpoints
3. You can manually trigger a connection test using the "Refresh Status" button
4. You can force a scaling check using the "Force Scaling Check" button to test scaling functionality
5. The component shows detailed status for each endpoint, including response times and error messages
6. You can toggle between Mock Mode and Live Backend Mode to test with/without a real backend

This tool is particularly useful for:
- Verifying your backend is properly set up and accessible
- Testing authentication is working
- Confirming the scaling functionality works end-to-end
- Debugging connectivity issues
- Testing the UI without a real backend (using mock mode)

## Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Navigate to http://localhost:3000 to see the dashboard.

## Production Build

```bash
# Build for production
npm run build

# Start the production server
npm start
```

## Testing

```bash
# Run tests
npm test
```

## API Response Formats

Your backend API should return data in the following formats:

### Metrics Response
```typescript
interface MetricsState {
  cpu: {
    current: number;
    trend: "increasing" | "decreasing" | "stable";
    history: Array<{ timestamp: string; value: number }>;
  };
  memory: {
    current: number;
    trend: "increasing" | "decreasing" | "stable";
    history: Array<{ timestamp: string; value: number }>;
  };
  network: {
    inbound: number;
    outbound: number;
    trend: "increasing" | "decreasing" | "stable";
    history: Array<{ timestamp: string; inbound: number; outbound: number }>;
  };
  timestamp: string;
}
```

### Scaling Status Response
```typescript
interface ScalingState {
  currentInstances: number;
  recommendedInstances: number;
  lastScalingAction: string;
  vmSize: string;
  cooldownRemaining: number;
}
```

### Model Status Response
```typescript
interface ModelState {
  primaryModel: string;
  primaryModelStatus: "online" | "offline";
  fallbackModel: string;
  fallbackModelStatus: "online" | "offline";
  lastRecommendationConfidence: number;
}
```

### Logs Response (Array of LogEntry)
```typescript
interface LogEntry {
  id: string;
  timestamp: string;
  action: "scale-up" | "scale-down" | "no-change";
  fromInstances: number;
  toInstances: number;
  confidence: number;
  reasoning: string;
  model: string;
}
``` 