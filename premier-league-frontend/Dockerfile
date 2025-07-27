FROM node:20-alpine AS stage0
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# This multi-line RUN command is for debugging purposes.
# It attempts to build the React app, captures its output,
# and then lists the contents of /app and /app/build to verify the build process.
RUN npm run build 2>&1 | tee build_output.log ; \
    echo "--- Output of npm run build ---" ; \
    cat build_output.log ; \
    echo "--- Contents of /app AFTER npm run build ---" ; \
    ls -la /app ; \
    echo "--- Contents of /app/build AFTER npm run build (should not be empty) ---" ; \
    ls -la /app/build || echo "ERROR: /app/build directory not found or is inaccessible in stage 0. Check previous build steps." ; \
    # Critical check: if /app/build exists but is empty, the React build failed to produce files.
    if [ -d "/app/build" ] && [ -z "$(ls -A /app/build)" ]; then \
        echo "CRITICAL WARNING: /app/build directory exists but is empty! React build likely failed to produce files." ; \
    fi

FROM node:20-alpine AS production-build
WORKDIR /app
# Copy the built React application from the previous stage
COPY --from=stage0 /app/build ./build
# Install 'serve' globally to serve the static files
RUN npm install -g serve
# Expose the port where the frontend server will listen
EXPOSE 3000
# Command to run the frontend server, serving static files from the 'build' directory
CMD ["serve", "-s", "build", "-l", "3000"]