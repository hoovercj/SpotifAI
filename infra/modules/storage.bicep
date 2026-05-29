// Storage Account for the intro-audio blob cache.
//
// Shared across dev + prod intentionally (see plan): the blob path is
// the cache key, so any developer who generates an intro warms the
// cache for everyone. personaVersion + promptVersion in the path
// prevent cache poisoning from dev experiments.
//
// Container is public-read so the browser can fetch /audio-intros/...
// WAVs directly without an auth round-trip; writes require the
// `Storage Blob Data Contributor` role assignment in main.bicep.

param location string
param tags object
param resourceToken string
@description('Object id of the App Service managed identity that should be granted Storage Blob Data Contributor on the container.')
param appServicePrincipalId string

@description('Name of the audio intro container. Public-read.')
param introsContainerName string = 'audio-intros'

var storageAccountName = take(toLower(replace('st${resourceToken}', '-', '')), 24)

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: true
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      // Browsers fetch the WAV directly into an <audio> element. Audio
      // elements don't require CORS for playback, but we allow * here
      // so future fetch()-based access (e.g. for waveform analysis)
      // doesn't bump into preflight.
      corsRules: [
        {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource introsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: introsContainerName
  properties: {
    publicAccess: 'Blob'
  }
}

// Storage Blob Data Contributor role — required for the App Service
// managed identity to upload to blob via DefaultAzureCredential.
// Role definition id is the well-known GUID for this built-in role.
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, appServicePrincipalId, storageBlobDataContributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: appServicePrincipalId
    principalType: 'ServicePrincipal'
  }
}

output storageAccountName string = storage.name
output introsContainer string = introsContainer.name
output blobEndpoint string = storage.properties.primaryEndpoints.blob
