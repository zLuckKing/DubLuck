FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 7000

ENV PORT=7000
ENV NODE_ENV=production

CMD ["node", "src/index.js"]
