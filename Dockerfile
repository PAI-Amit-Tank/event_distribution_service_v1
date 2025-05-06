# Stage 1: Build Stage (Install dependencies and compile TypeScript)
FROM node:18 AS builder
WORKDIR /usr/src/app

# Copy package files and install *all* dependencies (including dev for build)
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Compile TypeScript to JavaScript (will compile src and scripts based on tsconfig)
RUN npm run build

# Copy entrypoint script separately to ensure it's included
COPY entrypoint.sh .

# Stage 2: Production Stage (Copy only necessary artifacts)
FROM node:18-alpine AS production
WORKDIR /usr/src/app

# Copy package.json and lock file
COPY package*.json ./
# Install *only* production dependencies
RUN npm ci --only=production

# Copy compiled JavaScript code from the builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy migration files needed at runtime
COPY --from=builder /usr/src/app/migrations ./migrations

# Copy and set permissions for the entrypoint script from builder stage
COPY --from=builder /usr/src/app/entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# Expose the port the app runs on
EXPOSE 3000

# Set the entrypoint script to run migrations then the main app command
ENTRYPOINT ["entrypoint.sh"]
# Default command passed to entrypoint.sh (will be executed by exec "$@" in entrypoint.sh)
CMD ["node", "dist/src/index.js"]