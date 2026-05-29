targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment that can be used as part of naming resource convention')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Postgres administrator login name')
param postgresAdminLogin string = 'spotifai_admin'

@secure()
@description('Postgres administrator password (16+ chars, mix of upper/lower/number/symbol)')
param postgresAdminPassword string

@description('Google AI Studio API key (Gemini text + TTS)')
@secure()
param googleApiKey string

@description('Spotify Developer client ID')
@secure()
param spotifyClientId string

@description('Spotify Developer client secret')
@secure()
param spotifyClientSecret string

@description('Spotify OAuth redirect URI. Must exactly match an entry registered in the Spotify Developer dashboard.')
param spotifyRedirectUri string

@description('Long random string for Express session signing')
@secure()
param sessionSecret string

@description('OpenWeather API key (optional — pass empty string to disable)')
@secure()
param openWeatherApiKey string = ''

@description('LocationIQ API key (optional — pass empty string to disable)')
@secure()
param locationIqApiKey string = ''

@description('Rejseplanen access ID (optional — pass empty string to disable live transit feed)')
@secure()
param rejseplanenAccessId string = ''

@description('Comma-separated list of admin email addresses (optional — pass empty string for no auto-admins)')
param adminEmails string = ''

var resourceToken = uniqueString(subscription().id, environmentName, location)
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
  }
}

module appInsights 'modules/appInsights.bicep' = {
  name: 'appInsights'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
  }
}

module postgres 'modules/postgresql.bicep' = {
  name: 'postgresql'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
  }
}

// Storage account name follows a deterministic convention matching
// modules/storage.bicep — we precompute it here so we can wire it
// into App Service env vars before the storage module deploys, and
// the storage module asserts on the same name.
var storageAccountName = take(toLower(replace('st${resourceToken}', '-', '')), 24)
var storageIntrosContainer = 'audio-intros'

module web 'modules/appService.bicep' = {
  name: 'web'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    databaseUrl: postgres.outputs.connectionString
    googleApiKey: googleApiKey
    spotifyClientId: spotifyClientId
    spotifyClientSecret: spotifyClientSecret
    spotifyRedirectUri: spotifyRedirectUri
    sessionSecret: sessionSecret
    openWeatherApiKey: openWeatherApiKey
    locationIqApiKey: locationIqApiKey
    rejseplanenAccessId: rejseplanenAccessId
    adminEmails: adminEmails
    appInsightsConnectionString: appInsights.outputs.connectionString
    storageAccountName: storageAccountName
    storageIntrosContainer: storageIntrosContainer
  }
}

// Storage Account + role assignment for the App Service managed
// identity. Created AFTER the app service so we have a principalId
// for the role assignment.
module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    appServicePrincipalId: web.outputs.principalId
    introsContainerName: storageIntrosContainer
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output WEB_URI string = web.outputs.uri
output WEB_NAME string = web.outputs.name
output WEB_DEFAULT_HOSTNAME string = web.outputs.defaultHostName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = appInsights.outputs.connectionString
output AZURE_STORAGE_ACCOUNT string = storage.outputs.storageAccountName
output AZURE_STORAGE_BLOB_ENDPOINT string = storage.outputs.blobEndpoint
