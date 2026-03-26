FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code /app/pkg
WORKDIR /app/code

# Install Node.js 22
ARG NODE_VERSION=22.22.0
RUN mkdir -p /usr/local/node-$NODE_VERSION && \
    curl -L https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | \
    tar zxf - --strip-components 1 -C /usr/local/node-$NODE_VERSION
ENV PATH="/usr/local/node-$NODE_VERSION/bin:$PATH"

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

ENV NODE_ENV=production

# Symlink writable paths (dangling during build, valid at runtime)
RUN rm -rf /app/code/images && ln -s /app/data/images /app/code/images

# Copy packaging files
COPY start.sh env.sh.template nginx.conf.template /app/pkg/
RUN mv /app/pkg/nginx.conf.template /app/pkg/nginx.conf

CMD ["/app/pkg/start.sh"]
