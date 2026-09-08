FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source (see .dockerignore for skipped files)
COPY . .

# Apply the 2026 Amazon cookie refresh compatibility fixes and fail the image
# build if the patched JavaScript is not syntactically valid.
RUN node scripts/apply-cookie-refresh-fixes.js \
    && node --check index.js \
    && node --check libs/alexa-cookie/alexa-cookie.js

LABEL org.opencontainers.image.source="https://github.com/uberswimmer/echo-speaks-server"

EXPOSE 8091
ENV hubPlatform="Hubitat"
ENV useHeroku=false

CMD [ "node", "index.js" ]
