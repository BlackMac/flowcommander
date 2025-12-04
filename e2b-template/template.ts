import { Template } from "e2b";

const template = Template.fromDockerfile(`
FROM node:22-bookworm

WORKDIR /home/user

# Create package.json and install dependencies
RUN npm init -y && \\
    npm install express @sipgate/ai-flow-sdk typescript tsx @types/express @types/node

# Verify Node version
RUN node --version && npm --version
`);

template.name = "flowcommander-node22";

export default template;
