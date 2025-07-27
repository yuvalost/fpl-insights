# Use Node.js Alpine base image
FROM node:20-alpine as stage0

# Accept build arg
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Set work directory
WORKDIR /app

# Copy files and install deps
COPY package*.json ./
RUN npm install --production
COPY . .

# Build the React app with the API URL
RUN REACT_APP_API_URL=${REACT_APP_API_URL} npm run build

# Use serve for static hosting
FROM node:20-alpine as production-build
WORKDIR /app
COPY --from=stage0 /app/build ./build
RUN npm install -g serve

# Start the app using serve
CMD ["serve", "-s", "build", "-l", "3000"]
