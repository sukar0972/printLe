FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server code
COPY . .

# Create uploads directory explicitly
RUN mkdir -p uploads

# Expose the port defined in server.js
EXPOSE 3001

CMD ["node", "server.js"]
