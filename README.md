# task-api — Docker + Jenkins CI/CD project

An intermediate-level, fully containerized CI/CD project: a small **Node.js/Express REST API** (`task-api`) is linted, tested, built into a **multi-stage Docker image**, **pushed to Docker Hub**, deployed with **Docker Compose** and smoke-verified — end to end by a **Jenkins declarative pipeline** running in its own containers.

The only tools you need on any machine: **Docker** and **git**. No local Node.js, no JVM, no npm install — Jenkins itself runs the build inside throwaway `node:20-alpine` containers.

---

## What the pipeline does

| # | Stage | What happens |
|---|---------------------|--------------|
| 1 | Install dependencies | `npm ci` inside a throwaway `node:20-alpine` container |
| 2 | Lint | `eslint .` — build fails on any lint error |
| 3 | Unit tests | Jest + Supertest (21 tests) with **coverage threshold gate** (90% statements), JUnit report + browsable HTML coverage report in Jenkins |
| 4 | Build Docker image | Multi-stage build → slim non-root Alpine image, tagged `:$BUILD_NUMBER` and `:latest` |
| 5 | Push to Docker Hub | `docker login` with Jenkins credentials, push both tags |
| 6 | Deploy & verify | `docker compose up -d` on the Docker-in-Docker daemon, then curl `/health` through a one-shot curl container |

## Architecture

```
   GitHub repo  (source of truth — Jenkinsfile is the pipeline, Pipeline-as-Code)
        │
        │  clone (Pipeline from SCM)
        ▼
┌─ docker compose -f jenkins/docker-compose.yml ───────────────────────────────┐
│                                                                              │
│   ┌──────────────────────────┐        TLS :2376        ┌──────────────────┐  │
│   │ jenkins (controller)     │ ──────────────────────▶ │ docker:dind      │  │
│   │  • web UI on :8080       │   /certs/client certs   │ privileged dockerd│  │
│   │  • Docker CLI + compose  │                         │ builds & runs:   │  │
│   │  • plugins pre-installed │   workspace bind-mounts │  • node:20-alpine│  │
│   └────────────┬─────────────┘   (shared jenkins-data  │    lint/test pods │  │
│                │                  volume)              │  • task-api image │  │
│                └─────────────────────────────────────▶ │  • deployed app   │  │
│                                                       └────────┬─────────┘  │
└────────────────────────────────────────────────────────────────│────────────┘
                                                                 │ :3000
                                              host → http://localhost:3000
```

## Repository layout

```
docker-jenkins-task-api/
├── Jenkinsfile                  # declarative pipeline (6 stages)
├── Dockerfile                   # multi-stage build → slim non-root runtime
├── docker-compose.prod.yml      # how the pipeline deploys the app
├── src/                         # Express app (app factory + server entry)
├── tests/                       # Jest + Supertest suite (health, CRUD, errors)
├── jenkins/
│   ├── Dockerfile               # Jenkins LTS + Docker CLI + compose plugin
│   ├── plugins.txt              # pipeline plugins pre-installed at build time
│   └── docker-compose.yml       # controller + docker:dind sidecar
└── package.json                 # scripts: start / dev / lint / test / test:ci
```

## Prerequisites

- **Docker Engine 24+** with the compose plugin (Docker Desktop on macOS/Windows, `docker-ce` + `docker-compose-plugin` on Linux). Check: `docker compose version`
- **git**
- ~4 GB RAM free and three free ports: **8080** (Jenkins UI), **50000** (agents), **3000** (the app)
- Accounts: [GitHub](https://github.com) (for the code) and [Docker Hub](https://hub.docker.com) (for the images)

> ⚠️ The `docker:dind` container needs `privileged: true`. This works on Docker Desktop, plain Linux servers and most VMs — but not on hosts that forbid privileged containers (e.g. some managed CI runners).

---

## Quickstart — run the app right now (no Jenkins needed)

```bash
git clone https://github.com/pannalasiddharthreddy/Project1
cd Project1
docker build -t task-api:local .
docker run -d --name task-api -p 3000:3000 task-api:local
curl -s http://localhost:3000/health
```

### Try the API

```bash
# list seeded tasks
curl -s http://localhost:3000/api/tasks

# create a task
curl -s -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Learn Jenkins"}'

# mark task 3 done
curl -s -X PATCH http://localhost:3000/api/tasks/3 \
  -H 'Content-Type: application/json' \
  -d '{"done":true}'

# delete task 3 (204 No Content)
curl -i -X DELETE http://localhost:3000/api/tasks/3
```

| Method & path | Body | Success |
|---|---|---|
| `GET /health` | – | `200 {status:"ok", uptimeSeconds, timestamp}` |
| `GET /api/tasks` | – | `200 {count, tasks}` |
| `POST /api/tasks` | `{"title":"..."}` | `201` task |
| `GET /api/tasks/:id` | – | `200` task / `404` |
| `PATCH /api/tasks/:id` | `{"title":?,"done":?}` | `200` task / `400` / `404` |
| `DELETE /api/tasks/:id` | – | `204` / `404` |

Validation rules: `title` required, non-empty string, ≤ 120 characters (trimmed); `done` must be a boolean. Data is in-memory — it resets when the container restarts.

---

## Step 1 — Push this repo to GitHub

> Already done during setup: this history was pushed to **[pannalasiddharthreddy/Project1](https://github.com/pannalasiddharthreddy/Project1)** (branch `main`). The steps below stay as a reference for pushing to a fresh repo.

From the repo root:

```bash
# 1. Create an EMPTY repo on github.com named: docker-jenkins-task-api
#    (no README, no .gitignore, no license — avoid merge conflicts)

# 2. Point the repo at your GitHub remote and push
git remote add origin https://github.com/pannalasiddharthreddy/Project1.git
git push -u origin main
```

If you prefer the GitHub CLI:

```bash
gh repo create Project1 --public --source=. --push   # skip if the repo already exists
```

> **Private repo?** Jenkins will need read access too: in Step 4 add a second credential of kind *SSH username with private key* or *Username with password* (a fine-grained PAT with *Contents: read-only*) and select it in the job's SCM config.
>
> **Git identity:** the initial commits were made with a placeholder author. To stamp your own name on them:
> ```bash
> git config user.name  "Your Name"
> git config user.email "you@example.com"
> git rebase --root --exec 'git commit --amend --no-edit --reset-author'
> ```

## Step 2 — Start Jenkins (one command)

```bash
docker compose -f jenkins/docker-compose.yml up -d --build
```

First boot pulls and builds for a few minutes (Jenkins image + plugins). Then:

1. Open **http://localhost:8080**
2. Unlock with the initial admin password:
   ```bash
   docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
   ```
3. Plugins are **already pre-installed** (they were baked in by `jenkins/Dockerfile`), so click **“Start using Jenkins”** (or “Select plugins to install” → just save).
4. Create your first admin user.

## Step 3 — Store your Docker Hub credentials in Jenkins

1. Get a Docker Hub **access token**: hub.docker.com → *Account Settings* → *Personal access tokens* → **Generate new token** (Read & Write).
2. In Jenkins: **Manage Jenkins** → **Credentials** → *System* → *Global credentials* → **Add Credentials**:
   - Kind: **Username with password**
   - Username: *your Docker Hub username*
   - Password: *the access token*
   - ID: **`dockerhub-creds`** ← must match `DOCKERHUB_CREDS` in the Jenkinsfile

## Step 4 — Create the pipeline job

1. Jenkins dashboard → **New Item**
2. Name: `task-api` → type: **Pipeline** → OK
3. Scroll to **Pipeline**:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/pannalasiddharthreddy/Project1.git`
   - Script Path: `Jenkinsfile`
4. **Save**, then hit **Build Now**

## Step 5 — Watch it fly

The first build takes a while (pulling `node:20-alpine`, `docker:dind` layers, npm packages — all cached afterwards). Follow the stage view; when it's green:

```bash
# the pipeline deployed the app through dind, published on your host:
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/tasks
docker exec jenkins-docker docker ps   # see the running task-api container
```

Your image is now public on Docker Hub as `<your-username>/task-api` with tags `:latest` and `:<build-number>`.

---

## Run on ANY machine

**A. Full CI/CD stack from scratch** (the whole point — identical on Linux/macOS/Windows):

```bash
# 0) install Docker + git, then:
git clone https://github.com/pannalasiddharthreddy/Project1
cd Project1

# 1) boot Jenkins + dind
docker compose -f jenkins/docker-compose.yml up -d --build

# 2) unlock Jenkins (http://localhost:8080, password below), create admin user
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# 3) add the `dockerhub-creds` credential (Step 3 above)
# 4) create the job from your GitHub URL (Step 4 above) → Build Now
```

That's the complete migration path: **clone → compose up → one credential → one job.** The pipeline, plugins, Dockerfile and app all live in the repo, so nothing is hand-installed.

**B. Just run the app** (from any machine with Docker, no repo needed):

```bash
docker run -d --name task-api -p 3000:3000 <your-username>/task-api:latest
curl -s http://localhost:3000/health
```

Or with compose:

```bash
curl -O https://raw.githubusercontent.com/pannalasiddharthreddy/Project1/main/docker-compose.prod.yml
IMAGE_NAME=<your-username>/task-api IMAGE_TAG=latest docker compose -p task-api -f docker-compose.prod.yml up -d
```

**C. Local development without Docker** (requires Node.js 20+):

```bash
npm ci
npm run dev      # restart-on-save
npm test         # or: npm run lint
```

> **What travels and what doesn't:** the *code and pipeline* travel via GitHub; the *images* travel via Docker Hub. Jenkins job config and credentials live in the `jenkins-data` named **volume** on the machine that runs Jenkins — they are the only two things you re-create (Steps 3–4, ~2 minutes). Named volumes survive `docker compose down` and even reboots; they are only erased by `docker compose down -v` or `docker volume rm`.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `withCredentials` / “credentials dockerhub-creds could not be found” | Credential ID is exactly `dockerhub-creds` (Step 3). Re-check spelling. |
| `docker login` → `unauthorized: incorrect username or password` | Use a **personal access token**, not your account password. Username = Docker Hub username, all lowercase. |
| `denied: requested access to the resource is denied` on push | Wrong username (image namespace must be *your* Docker Hub username), or the repo belongs to an org where you lack write rights. `docker push` auto-creates personal repos on first push. |
| `npm ci` fails with “lock file missing” or empty workspace | dind can’t see the Jenkins workspace — the `jenkins-data:/var/jenkins_home` mount in the dind service is what fixes this. Don’t remove it. |
| Port 8080 / 3000 already in use | Change the left side of the mapping (`"8081:8080"`, `"3001:3000"`) in `jenkins/docker-compose.yml`, then `docker compose -f jenkins/docker-compose.yml up -d`. |
| dind fails to start / `privileged` errors | The host must allow privileged containers. Docker Desktop & normal Linux do; some managed runners don’t. |
| Deploy OK but `localhost:3000` unreachable | The app publishes port 3000 *through dind* — the `ports: "3000:3000"` mapping on the `docker-dind` service in `jenkins/docker-compose.yml` must be present, and you must curl from the **host**, not from inside the jenkins container. |
| Verify stage: `network task-api_default not found` | The `docker compose up` in the previous step failed — scroll up to its log. |
| Everything is slow on the first build | Normal: base images + npm packages are being pulled into dind. Subsequent builds hit the cache. |
| Jenkins UI unreachable after reboot | `docker compose -f jenkins/docker-compose.yml up -d` (the stack has `restart: unless-stopped`, so usually it comes back by itself). |

## Cleanup / teardown

```bash
# stop the deployed app (runs inside dind)
docker exec jenkins-docker docker rm -f task-api

# stop Jenkins + dind (keep volumes → keeps Jenkins config, jobs and image cache)
docker compose -f jenkins/docker-compose.yml down

# nuclear option: also wipe Jenkins state and dind image cache
docker compose -f jenkins/docker-compose.yml down -v
```

## Where to go next (stretch goals)

1. **Webhook triggers** — GitHub webhook + “Poll SCM” off, so every push builds automatically.
2. **Multibranch pipeline** — build PRs into temp environments, tag builds from `main` only.
3. **Rollback stage** — keep the last-known-good tag and redeploy it in `post { failure }`.
4. **Jenkins Configuration as Code (JCasC)** — move the credential/job bootstrap from README steps into `jenkins/casc.yaml`.
5. **Multi-arch images** — `docker buildx` for arm64 + amd64.
6. **Deploy to Kubernetes** — swap the compose stage for a `kubectl apply` stage.

---

*Stack: Node.js 20 · Express 4 · Jest 30 + Supertest 7 · ESLint 9 · Docker multi-stage (Alpine) · Jenkins LTS (declarative pipeline) · docker:dind · Docker Hub · Docker Compose v2.*
