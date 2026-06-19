# ── Étape 1 : build du client Vite ────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --prefer-offline
RUN echo 'bust-v4.1-final' > /tmp/bust
COPY client/ ./
RUN npm run build

# ── Étape 2 : serveur de production ───────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Dépendances serveur (inclut devDeps pour Prisma CLI)
COPY server/package*.json ./server/
RUN cd server && npm ci --prefer-offline

# Code source serveur + schéma Prisma
COPY server/ ./server/

# Générer le client Prisma pour Linux x64
RUN cd server && npx prisma generate

# Build client
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
EXPOSE 3000

# Au démarrage : migrations → serveur
CMD ["sh", "-c", "cd /app/server && npx prisma migrate deploy && node src/index.js"]
