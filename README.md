# GeoTracker API

API de telemetria para entregas last-mile, com Fastify, PostgreSQL/PostGIS e TypeScript.

## Executar com Docker (caminho canônico)

1. Crie o arquivo de ambiente: `cp .env.example .env`.
2. Suba os serviços: `docker compose up --build -d`.
3. Aplique o schema: `docker compose exec api npm run migrate`.
4. Verifique: `curl http://localhost:3000/health`.

Docker fixa as versões de Node 22, PostGIS e dependências, sendo a forma de execução suportada para colaboradores e automação no GitHub.

## Executar diretamente no host (opcional)

Use Node.js 22 ou superior (`nvm use`, se usar NVM), execute `npm install`, `docker compose up -d db`, `npm run migrate` e `npm run dev`.

## Validar PostGIS e tabelas

```sh
docker compose exec db psql -U geotracker -d geotracker -c "SELECT PostGIS_Full_Version();"
docker compose exec db psql -U geotracker -d geotracker -c "\\dt"
```

`raw_telemetry` é append-only: o banco rejeita `UPDATE` e `DELETE`. `processed_locations` é reservada ao resultado futuro de snap sobre `routes.planned_path`, usando funções PostGIS como `ST_ClosestPoint`.
