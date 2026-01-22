# Use the official Node.js runtime as the base image
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application (minify files)
RUN npm run build

# Expose port 80
EXPOSE 80

# Start the application
CMD ["npm", "start"]
