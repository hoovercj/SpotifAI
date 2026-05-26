param location string
param tags object
param resourceToken string
param logAnalyticsWorkspaceId string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    // Consumption-only plan: omitting the workloadProfiles array.
  }
}

output environmentId string = environment.id
output defaultDomain string = environment.properties.defaultDomain
