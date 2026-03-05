dev:
	docker compose -f infra/docker-compose.yml up --build

stop:
	docker compose -f infra/docker-compose.yml down

logs:
	docker compose -f infra/docker-compose.yml logs -f

rebuild:
	docker compose -f infra/docker-compose.yml up --build --force-recreate
