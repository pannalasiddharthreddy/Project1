# Custom Jenkins controller image: official LTS + Docker CLI + compose plugin
# + the plugins this pipeline needs. Building it once (via jenkins/docker-compose.yml)
# means a brand-new machine gets a fully provisioned Jenkins with one command.
FROM jenkins/jenkins:lts

USER root

# Install the Docker CLI and compose plugin so the controller can drive the
# docker:dind sidecar (DOCKER_HOST=tcp://docker:2376). Only the client is
# needed - the daemon itself runs in the separate privileged dind container.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

USER jenkins

# Pre-install pipeline plugins (resolved to their latest compatible versions).
COPY --chown=jenkins:jenkins plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
