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

Echo Speaks stores `es_config.json`, `session.json`, and logs under the container user's home directory. This image sets `HOME=/mnt/es-data`, so those files are written to `/mnt/es-data`.

Mount persistent storage at `/mnt/es-data`. For the existing deployment this is:

```text
/home/docker/EchoSpeaks:/mnt/es-data
```

This allows Watchtower to replace the container without losing authentication or configuration data.

Example Docker creation command:

```bash
docker create --name=Echo-Speaks-Server \
  -p 8091:8091 \
  -e ipAddress=192.168.1.15 \
  -v /home/docker/EchoSpeaks:/mnt/es-data \
  --restart unless-stopped \
  ghcr.io/uberswimmer/echo-speaks-server:latest
```

`PUID` and `PGID` environment variables are not consumed by the upstream Echo Speaks Server image and therefore do not change the process UID/GID. They may be left in an existing container definition harmlessly, but are not required by this image.

Preserve any additional environment variables, labels, network settings, port mappings, and Watchtower labels from the existing deployment.

## Watchtower

Once the container is running from `ghcr.io/uberswimmer/echo-speaks-server:latest`, Watchtower can automatically update it when a new `latest` digest is published.

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
