FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm install
COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN npx nest build
EXPOSE 3001
CMD ["node", "dist/main.js"]
