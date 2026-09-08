# echo-speaks-server

Personal fork of Echo Speaks Server 2.8.0 for Hubitat, with 2026 Amazon authentication refresh compatibility fixes.

## Authentication maintenance

The Docker image applies focused fixes for the current Amazon cookie lifecycle:

- restores locally persisted session data correctly;
- persists successfully refreshed credentials to `session.json`;
- proactively refreshes credentials every 24 hours for local deployments;
- keeps the last known-good credentials if a refresh fails;
- avoids re-registering the Alexa app during routine refresh, preserving the existing Amazon device registration.

The underlying Echo Speaks application behavior remains otherwise unchanged.

## Docker image

Pushes to `master` publish a multi-architecture image to:

```text
ghcr.io/uberswimmer/echo-speaks-server:latest
```

Supported image platforms are `linux/amd64` and `linux/arm64`.

## Persistent data

Echo Speaks stores `es_config.json`, `session.json`, and logs under the container user's home directory. With this image that is `/root`.

Always mount persistent storage at `/root`. Replacing or updating the container without preserving `/root` can discard authentication and configuration data.

Example Compose service:

```yaml
services:
  echo-speaks-server:
    image: ghcr.io/uberswimmer/echo-speaks-server:latest
    restart: unless-stopped
    ports:
      - "8091:8091"
    volumes:
      - ./echo-speaks-data:/root
    environment:
      - hubPlatform=Hubitat
      - useHeroku=false
```

Preserve any additional environment variables, labels, network settings, port mappings, and volume paths from the existing deployment.

## Watchtower

Watchtower can automatically update the container after it is running from the GHCR `latest` image. It cannot turn a locally built image or an image from a different registry/repository into this image automatically, so switching the container to the GHCR image is a one-time manual deployment step.

If the GHCR package is private, Docker and Watchtower must be authenticated to `ghcr.io`. If the package is public, pulls can be anonymous.

## Verification

After startup, the server should log that the local scheduled cookie refresh is enabled. A successful scheduled refresh should later include messages similar to:

```text
Starting scheduled cookie refresh (every 24 hours (local))...
Scheduled cookie refresh triggered...
Alexa-Cookie: Skip App registration during refresh and update local cookies
Scheduled cookie refresh completed successfully.
```

A failed refresh should retain the existing authentication rather than clearing Hubitat authentication or restarting solely because the refresh failed.
