param location string
param tags object
param resourceToken string

resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  // ACR names must be globally unique, alphanumeric, lowercase, 5-50 chars.
  name: 'acr${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    anonymousPullEnabled: false
  }
}

output name string = registry.name
output loginServer string = registry.properties.loginServer
output id string = registry.id
