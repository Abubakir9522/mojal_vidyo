FROM node:22-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 NODE_NO_WARNINGS=1
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server.js"]
