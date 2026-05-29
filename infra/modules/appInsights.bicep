// Application Insights (workspace-based) on top of the existing Log
// Analytics workspace. Connection string is exposed as an output so
// the App Service module can wire it into APPLICATIONINSIGHTS_CONNECTION_STRING.

param location string
param tags object
param resourceToken string
param logAnalyticsWorkspaceId string

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceToken}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspaceId
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output instrumentationKey string = appInsights.properties.InstrumentationKey
output connectionString string = appInsights.properties.ConnectionString
output appInsightsId string = appInsights.id
output name string = appInsights.name
