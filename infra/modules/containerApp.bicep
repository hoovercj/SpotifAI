param location string
param tags object
param resourceToken string

param containerAppEnvId string
param containerRegistryName string
param containerRegistryLoginServer string

@secure()
param databaseUrl string
@secure()
param googleApiKey string
@secure()
param spotifyClientId string
@secure()
param spotifyClientSecret string
@secure()
param sessionSecret string
@secure()
param openWeatherApiKey string
@secure()
param locationIqApiKey string
@secure()
param rejseplanenAccessId string

@description('Image to deploy. azd overrides this with the registry/repo/tag it builds.')
param imageName string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Port the container listens on inside the pod')
param targetPort int = 3000

// Managed identity used by the Container App to pull from ACR.
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-app-${resourceToken}'
  location: location
  tags: tags
}

// Grant the identity AcrPull on the registry.
resource registryRef 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: containerRegistryName
}

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registryRef
  name: guid(registryRef.id, appIdentity.id, acrPullRoleDefinitionId)
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-web-${resourceToken}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppEnvId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            weight: 100
            latestRevision: true
          }
        ]
      }
      registries: [
        {
          server: containerRegistryLoginServer
          identity: appIdentity.id
        }
      ]
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'google-api-key', value: googleApiKey }
        { name: 'spotify-client-id', value: spotifyClientId }
        { name: 'spotify-client-secret', value: spotifyClientSecret }
        { name: 'session-secret', value: sessionSecret }
        { name: 'open-weather-api-key', value: openWeatherApiKey }
        { name: 'location-iq-api-key', value: locationIqApiKey }
        { name: 'rejseplanen-access-id', value: rejseplanenAccessId }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: imageName
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: string(targetPort) }
            { name: 'QUIET', value: 'TRUE' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'GOOGLE_API_KEY', secretRef: 'google-api-key' }
            { name: 'SPOTIFY_CLIENT_ID', secretRef: 'spotify-client-id' }
            { name: 'SPOTIFY_CLIENT_SECRET', secretRef: 'spotify-client-secret' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'OPEN_WEATHER_API_KEY', secretRef: 'open-weather-api-key' }
            { name: 'LOCATION_IQ_API_KEY', secretRef: 'location-iq-api-key' }
            { name: 'REJSEPLANEN_ACCESS_ID', secretRef: 'rejseplanen-access-id' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    acrPull
  ]
}

output name string = app.name
output uri string = 'https://${app.properties.configuration.ingress.fqdn}'
output identityPrincipalId string = appIdentity.properties.principalId
