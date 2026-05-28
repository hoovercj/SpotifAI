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
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output WEB_URI string = web.outputs.uri
output WEB_NAME string = web.outputs.name
output WEB_DEFAULT_HOSTNAME string = web.outputs.defaultHostName
