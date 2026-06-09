param location string
param tags object
param resourceToken string
param logAnalyticsWorkspaceId string

@secure()
param databaseUrl string
@secure()
param googleApiKey string
@secure()
param spotifyClientId string
@secure()
param spotifyClientSecret string
param spotifyRedirectUri string
@secure()
param sessionSecret string
@secure()
param openWeatherApiKey string
@secure()
param rejseplanenAccessId string

@description('Comma-separated list of admin email addresses (seeded on every boot).')
param adminEmails string

@description('App Insights connection string (passed to both server and client).')
@secure()
param appInsightsConnectionString string = ''

@description('Storage account name hosting the intro-audio blob container.')
param storageAccountName string = ''

@description('Blob container name for cached intro audio.')
param storageIntrosContainer string = 'audio-intros'

@description('App Service Plan SKU. B1 is the cheapest always-on Linux tier.')
param skuName string = 'B1'

@description('App Service Plan tier.')
param skuTier string = 'Basic'

var planName = 'plan-${resourceToken}'
var siteName = 'app-web-${resourceToken}'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Filter optional settings so we don't ship empty app settings if they aren't set.
var optionalSettings = filter([
  { name: 'OPEN_WEATHER_API_KEY', value: openWeatherApiKey }
  { name: 'REJSEPLANEN_ACCESS_ID', value: rejseplanenAccessId }
  { name: 'ADMIN_EMAILS', value: adminEmails }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
  // Also expose to the client bundle. vite.config.mjs forwards
  // VITE_APPINSIGHTS_CONNECTION_STRING via `define`, so this lands
  // in the build environment when `azd deploy` runs.
  { name: 'VITE_APPINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
  { name: 'AZURE_STORAGE_ACCOUNT', value: storageAccountName }
  { name: 'AZURE_STORAGE_CONTAINER', value: storageIntrosContainer }
], s => !empty(s.value))

var baseSettings = [
  // CI builds a slim self-contained artifact in `release/` (server + dist +
  // public + production node_modules) and azd zip-deploys it as-is. Oryx must
  // stay disabled so it doesn't try to re-run `npm install` / `npm run build`
  // on the host.
  { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
  { name: 'ENABLE_ORYX_BUILD', value: 'false' }
  { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
  // NODE_ENV controls Express session cookie `secure` flag, etc.
  { name: 'NODE_ENV', value: 'production' }
  { name: 'DATABASE_URL', value: databaseUrl }
  { name: 'GOOGLE_API_KEY', value: googleApiKey }
  { name: 'SPOTIFY_CLIENT_ID', value: spotifyClientId }
  { name: 'SPOTIFY_CLIENT_SECRET', value: spotifyClientSecret }
  { name: 'SPOTIFY_REDIRECT_URI', value: spotifyRedirectUri }
  { name: 'SESSION_SECRET', value: sessionSecret }
]

var allSettings = concat(baseSettings, optionalSettings)

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: siteName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      // Use the package.json `start` script (node server/index.js).
      appCommandLine: 'npm start'
      appSettings: allSettings
      // App Service ping this path every minute. /healthz always
      // returns 200; /readyz includes a DB check we'd rather not pay
      // every minute against Postgres.
      healthCheckPath: '/healthz'
    }
  }
}

// Stream all App Service logs into the shared Log Analytics workspace.
resource diagSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: site
  name: 'log-all'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceAppLogs', enabled: true }
      { category: 'AppServicePlatformLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

// NOTE: custom domains (hostNameBindings) are intentionally NOT managed in Bicep.
// hostNameBindings are child resources, so adding one in the Azure Portal will
// survive subsequent `azd provision` runs as long as this template never
// declares its own hostNameBindings entry. To add radio.codyhoover.com:
//   1. CNAME radio -> <defaultHostName>  (and asuid.radio TXT -> Custom Domain Verification ID)
//   2. Portal -> this App Service -> Custom domains -> Add custom domain
//   3. Add a Managed Certificate (free, auto-renews) and bind it
// The binding will persist across all future deploys.

output name string = site.name
output uri string = 'https://${site.properties.defaultHostName}'
output defaultHostName string = site.properties.defaultHostName
output principalId string = site.identity.principalId
