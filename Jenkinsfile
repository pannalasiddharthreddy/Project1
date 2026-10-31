/*
 * CI/CD pipeline for task-api (declarative, Pipeline-as-Code).
 *
 * Stage overview
 *  1. Install dependencies - npm ci inside a throwaway node:20-alpine container
 *  2. Lint                - ESLint gate
 *  3. Unit tests          - Jest + Supertest with coverage threshold + JUnit report
 *  4. Build Docker image  - multi-stage build tagged :$BUILD_NUMBER and :latest
 *  5. Push to Docker Hub  - uses the `dockerhub-creds` credentials (see README)
 *  6. Deploy & verify     - docker compose up on the dind daemon, then curl /health
 *
 * Requirements on the Jenkins controller (all provided by jenkins/Dockerfile):
 *  - Docker CLI + compose plugin
 *  - DOCKER_HOST pointing at the docker:dind sidecar (see jenkins/docker-compose.yml)
 *  - plugins: workflow-aggregator, git, docker-workflow, junit, timestamper,
 *             pipeline-stage-view, htmlpublisher
 */
pipeline {
    agent any

    options {
        timestamps()
        // The deploy stage publishes host port 3000 - two concurrent builds would collide.
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        APP_NAME        = 'task-api'
        DOCKERHUB_CREDS = 'dockerhub-creds'   // Jenkins credential: Username with password
        COMPOSE_PROJECT = 'task-api'
    }

    stages {

        stage('Install dependencies') {
            agent {
                docker { image 'node:20-alpine' }
            }
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            agent {
                docker { image 'node:20-alpine' }
            }
            steps {
                sh 'npm run lint'
            }
        }

        stage('Unit tests') {
            agent {
                docker { image 'node:20-alpine' }
            }
            steps {
                sh 'npm run test:ci'
                junit testResults: 'reports/junit/junit.xml', allowEmptyResults: false
                publishHTML(target: [
                    reportDir:            'coverage/lcov-report',
                    reportFiles:          'index.html',
                    reportName:           'Jest coverage report',
                    allowMissing:         true,
                    keepAll:              true
                ])
            }
        }

        stage('Build Docker image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId:    env.DOCKERHUB_CREDS,
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    script {
                        env.IMAGE_NAME = "${DOCKERHUB_USER}/${APP_NAME}"
                    }
                    sh '''
                        docker build \
                            --tag "$IMAGE_NAME:$BUILD_NUMBER" \
                            --tag "$IMAGE_NAME:latest" \
                            .
                    '''
                }
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId:    env.DOCKERHUB_CREDS,
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    sh '''
                        echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USER" --password-stdin
                        docker push "$IMAGE_NAME:$BUILD_NUMBER"
                        docker push "$IMAGE_NAME:latest"
                        docker logout
                    '''
                }
            }
        }

        stage('Deploy & verify') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId:    env.DOCKERHUB_CREDS,
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    sh '''
                        echo "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USER" --password-stdin
                        export IMAGE_TAG="$BUILD_NUMBER"
                        docker compose \
                            --project-name "$COMPOSE_PROJECT" \
                            --file docker-compose.prod.yml \
                            up --detach --remove-orphans
                    '''
                }
                retry(3) {
                    sh '''
                        docker run --rm --network "${COMPOSE_PROJECT}_default" curlimages/curl:8.8.0 \
                            --retry 5 --retry-delay 2 --retry-connrefused \
                            --fail --silent --show-error \
                            http://app:3000/health
                    '''
                }
                echo "task-api deployed. Try it from this machine: curl http://localhost:3000/health"
            }
        }
    }

    post {
        always {
            // Tidy up dangling layers left by multi-stage builds on the dind daemon.
            sh 'docker image prune --force || true'
        }
        success {
            echo "Pipeline finished: ${env.IMAGE_NAME ?: env.APP_NAME}:${env.BUILD_NUMBER} deployed."
        }
        failure {
            echo 'Pipeline failed - open the first red stage in the log above for the cause.'
        }
    }
}
