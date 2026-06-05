FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production

COPY . .

# Default port for HF Spaces
ENV PORT=7860

EXPOSE 7860

CMD ["node", "server.js"]
