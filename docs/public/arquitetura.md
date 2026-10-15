# GeoTracker-API — Arquitetura

## Visão do produto

Uma API de telemetria em tempo real para operações last-mile e frotas urbanas. Ela recebe posições de dispositivos, mantém a última localização operacional de cada veículo e permite que clientes consultem proximidade, permanência e entrada/saída de áreas geográficas. O projeto prioriza corretude espacial, baixa latência de leitura e rastreabilidade de eventos.

## Contexto do domínio

O núcleo do domínio é composto por **Organização**, **Entrega**, **Veículo**, **Dispositivo**, **Posição**, **Jornada de entrega** e **Geofence**. Uma organização possui entregas, veículos e geofences; um veículo pode ser associado a um dispositivo; o dispositivo emite posições ordenadas por tempo de origem. Uma posição recebida é um fato imutável. Eventos como `delivery.entered_geofence` são projeções derivadas, nunca substitutos do histórico.

O limite principal separa a ingestão de telemetria do consumo operacional: a primeira aceita e valida fatos; a segunda oferece consultas, alertas e atualizações em tempo real. Isso evita que o canal de rastreamento fique acoplado à interface de acompanhamento. O vocabulário é deliberadamente limitado à logística de entregas; não há conceitos de transporte público, catraca, bilhetagem, passageiro ou validação de acesso.

## Limites e organização do código

O código será organizado por módulos de negócio, começando por `tracking` e `routes` (rotas de entrega), sem um CRUD genérico central. Em cada módulo:

- `domain/` contém entidades, value objects e regras puras — por exemplo, ordenação de telemetria e elegibilidade de uma posição para processamento.
- `application/` contém casos de uso e portas (`RecordRawPosition`, `ProcessPosition`, `FindRouteTrace`), que coordenam transações sem depender de Fastify, Postgres ou WebSocket.
- `infrastructure/` implementa repositórios Postgres/PostGIS, processador de map matching e publicador WebSocket.
- `http/` e `realtime/` são adaptadores finos: validam contrato, chamam um caso de uso e traduzem o resultado para HTTP ou evento.

Essa separação permite testar regras espaciais e de rastreamento sem servidor ou banco, e substitui detalhes de infraestrutura sem contaminar o domínio.

## Stack tecnológica

- **Node.js + TypeScript + Fastify:** Fastify oferece um caminho HTTP de baixo overhead e schemas de requisição; TypeScript mantém contratos explícitos entre transporte e domínio.
- **PostgreSQL + PostGIS:** uma fonte de verdade relacional com índices espaciais. `ST_DWithin` atende buscas por raio, e `ST_Intersects`/`ST_Contains` atendem geofences sem trazer geometria para a aplicação.
- **WebSocket:** canal de assinatura para o mapa operacional; HTTP permanece o contrato para comandos e consultas paginadas.
- **Docker Compose:** ambiente local reproduzível com API e PostGIS, sem serviços obrigatórios antes de o fluxo principal existir.

## Dados, auditabilidade e mensageria

Toda mensagem válida é persistida primeiro em `raw_gps_positions`: `device_id`, `vehicle_id`, `recorded_at`, `received_at`, latitude, longitude, precisão, velocidade, rumo e payload de origem. A linha é append-only: não é corrigida, sobrescrita nem apagada por reprocessamento. O payload e os tempos de origem/recebimento preservam evidência suficiente para auditoria, investigação de divergências e reprodução do processamento.

`processed_positions` guarda o resultado derivado para uso operacional: referência ao ponto bruto, localização ajustada (`geography(Point, 4326)`), método/versão de processamento, confiança e `processed_at`. Assim, o map matching pode evoluir ou ser reexecutado sem alterar o fato recebido. Apenas posições processadas — e a projeção `vehicle_current_positions` derivada delas — alimentam mapa, consultas de acompanhamento e broadcasts WebSocket.

Ambas as tabelas têm índice composto por veículo/tempo; `processed_positions.location` e geofences usam GiST. As consultas por raio usam `ST_DWithin`; os traços por período usam `ST_MakeLine` sobre posições ordenadas por `recorded_at`. As consultas devem sempre limitar organização, veículo e intervalo temporal antes de construir geometrias.

Geofences usam `geometry(Polygon, 4326)` e índice GiST. A primeira versão calcula transições após o processamento e registra `geofence_events` idempotentes, com chave da posição processada e geofence. Uma fila externa só será introduzida quando os limites de ingestão justificarem desacoplar a projeção e as notificações.

O contrato em tempo real será de leitura: `tracking.position.updated` conterá identificadores, horário, coordenada processada e metadados de qualidade; nunca o payload bruto. Autorização por organização será aplicada tanto na assinatura WebSocket quanto em todas as consultas HTTP.

## Observabilidade e infraestrutura

Logs estruturados incluem `requestId`, organização, veículo e latências, sem coordenadas completas por padrão. Métricas expõem taxa de ingestão, atraso entre `recorded_at` e `received_at`, erros de validação, conexões WebSocket e duração de consultas PostGIS. Traces OpenTelemetry conectam HTTP, acesso ao banco e publicação de eventos.

O CI executará lint, testes unitários e uma suíte de integração contra PostGIS. As imagens Docker serão imutáveis por commit; o deploy aplica migrations antes da nova versão. Dashboards acompanham atraso de telemetria e p95 de consulta espacial; alertas distinguem indisponibilidade da API de dados atrasados no dispositivo.
