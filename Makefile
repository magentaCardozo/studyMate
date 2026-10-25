# Raccourcis de développement StudyMate AI
include .env
export

.PHONY: up down logs test test-backend test-web android ps

up:            ## Démarre toute la pile (web : http://localhost:8088)
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api worker

ps:
	docker compose ps

test: test-backend test-web

test-backend:  ## Tests backend dans Docker (base studymate_test dédiée)
	docker compose --profile test run --rm --build backend-tests

test-web:
	cd web && npm ci && npm test

android:       ## APK de débogage via Docker → android/dist/
	docker compose --profile android run --rm android-build
