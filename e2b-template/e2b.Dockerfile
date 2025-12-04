# E2B Sandbox Template for FlowCommander
# Pre-configured with Node.js 22 and all required dependencies

FROM node:22-bookworm

# Set working directory
WORKDIR /home/user

# Create package.json with dependencies
RUN npm init -y && \
    npm install express @sipgate/ai-flow-sdk typescript tsx @types/express @types/node

# Verify installations
RUN node --version && npm --version
