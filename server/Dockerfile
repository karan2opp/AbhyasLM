FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY python ./python
RUN pip3 install --no-cache-dir --break-system-packages -r python/pdf_extractor/requirements.txt
ENV PYTHON_BIN=python3
ENV PORT=8000
EXPOSE 8000
CMD ["node", "dist/src/index.js"]
