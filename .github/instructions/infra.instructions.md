---
applyTo: "infra/**/*.bicep"
---

# Infra conventions

Active when editing Bicep under `infra/`.

## Topology
- `main.bicep` is the subscription-scope entry point. It creates the resource group and composes modules.
- Modules go in `infra/modules/<name>.bicep`. One resource family per module.
- Outputs from a module are how you cross-wire — don't reach into another module's resources directly.

## Resource naming
- Names use a `resourceToken` (computed in `main.bicep` from `uniqueString(subscription().id, environmentName, location)`) so each environment gets distinct resources.
- Storage account name: `take(toLower(replace('st${resourceToken}', '-', '')), 24)` — matches the regex Azure requires and stays under 24 chars.
- Pattern: `<prefix>-${resourceToken}` for everything except storage (`<prefix>${resourceToken}`).

## Secrets
- Mark secret params with `@secure()`.
- Don't hard-code secrets — accept them as `azd up` will pass them from `azure.yaml` `env` values + the `azd env set` store.
- Don't log secrets in `output` declarations.

## Managed identity
- The App Service has a system-assigned managed identity. Grant access to other resources via `Microsoft.Authorization/roleAssignments@2022-04-01` scoped to the target resource.
- Use the well-known built-in role IDs (e.g. `ba92f5b4-2d11-453d-a403-e96b0029c9fe` for Storage Blob Data Contributor). Comment what role each ID is.

## Diagnostic settings
- Anything new that emits telemetry should send to the shared Log Analytics workspace via a `Microsoft.Insights/diagnosticSettings@2021-05-01-preview` child resource.
- App Insights itself is workspace-based against the same Log Analytics — single sink, single Kusto surface.

## App Service settings
- All env vars go in `siteConfig.appSettings`.
- Use the `optionalSettings` + `filter()` pattern in [infra/modules/appService.bicep](../../infra/modules/appService.bicep) so empty params don't ship as empty app settings.
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false` + `ENABLE_ORYX_BUILD=false` are required — CI ships a pre-built artifact. Don't enable Oryx.
- `healthCheckPath: '/healthz'` is set so the App Service warm-up probe doesn't 404. Don't change to `/readyz` (that path hits Postgres).

## Don't
- Don't add Front Door, CDN profiles, or WAF without explicit user OK (see the cost discussion in [docs/architecture.md](../../docs/architecture.md)).
- Don't expose the Postgres password as an output.
- Don't run `azd up` from your local machine without explicit user OK. Provisioning is destructive in some scenarios.
- Don't change SKUs (App Service B1, Postgres Burstable B1ms) without checking the bill impact.
