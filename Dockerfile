FROM node:18-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies including dev dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Run tests (uncomment when you have tests)
# RUN npm test

# Remove dev dependencies
RUN npm prune --production

# Production image
FROM node:18-slim

# Set environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    # Prevents container from being killed due to OOM issues
    NODE_OPTIONS="--max-old-space-size=2048" 

# Install security updates and required packages
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/config ./config

# Create data and logs directories
RUN mkdir -p /app/data /app/logs

# Create a non-root user and set permissions
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

# Define volumes for persistent data
VOLUME ["/app/data", "/app/logs"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node ./scripts/healthcheck.js || exit 1

# Default port exposure
EXPOSE 3000

# Use dumb-init as entrypoint to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Command to run the application
CMD ["node", "src/index.js"] 