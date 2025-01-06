FROM node:latest

# Build arguments
ARG BASEURI

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV BASEURI=$BASEURI

# Create app directory
WORKDIR /app

# Copy the source code
COPY . .

# Install dependencies
RUN npm install
RUN mkdir -p /var/www/html

# Expose the port the app runs on
EXPOSE 8080

# Serve the app
CMD ["npm", "run", "pages", "serve", "/var/www/html/"]
