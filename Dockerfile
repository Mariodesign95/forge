FROM node:20-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ curl unzip && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production

COPY . .

# Download Colabrodo DB during build — baked into the image, no runtime download!
RUN mkdir -p data && \
    curl -L -o data/pezzhub-db.jsonl.zip \
    "https://github.com/sybaumike/colabrodoviola/raw/main/pezzhub-db.jsonl.zip" && \
    echo "✅ Colabrodo DB downloaded during build"

# Render sets PORT dynamically; fallback to 7000
ENV PORT=7000

EXPOSE ${PORT}

CMD ["node", "server.js"]


