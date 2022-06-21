---
page_type: sample
languages:
- typescript
products:
- azure
- azure-virtual-machines
description: "This sample explains how to create a VM with Managed Service Identity enabled."
urlFragment: compute-node-msi-vm
---

# Create a VM with MSI authentication enabled

This sample explains how to create a VM with Managed Service Identity enabled.

**On this page**

- [Run this sample](#run)
- [What does index.js do?](#sample)

## Run this sample

1. If you don't already have it, [get the latest LTS version of node.js](https://nodejs.org).

1. Clone the repository.

    ```
    git clone https://github.com/Azure-Samples/compute-node-msi-vm.git
    ```

1. Install the dependencies.

    ```
    cd compute-node-msi-vm
    npm install
    ```

1. Create an Azure service principal either through
    [Azure CLI](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal-cli/),
    [PowerShell](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal/)
    or [the portal](https://azure.microsoft.com/documentation/articles/resource-group-create-service-principal-portal/).

#### Important note: to be able to run this sample, your Service Principal MUST have "Owner" role enabled, or at least the "Microsoft.Authorization/*/write" permission. Learn more about [Built-in Role for Azure](https://docs.microsoft.com/azure/active-directory/role-based-access-built-in-roles)

1. Set the following environment variables using the information from the service principle that you created.

    ```
    export AZURE_SUBSCRIPION_ID={your subscription id}
    export CLIENT_ID={your client id}
    export APPLICATION_SECRET={your client secret}
    export DOMAIN={your tenant id as a guid OR the domain name of your org <contosocorp.com>}
    ```

    > [AZURE.NOTE] On Windows, use `set` instead of `export`.

1. Run the sample.

    ```
    node dist/lib/index.js
    ```

1. To clean up after index.js, run the cleanup script.

    ```
    node cleanup.js <resourceGroupName> <vmName>
    ```

<a id="sample"></a>
## What does index.js do?

The sample creates a VM with MSI creation. Then assign permission to that token. Finally
it installs the VM extension necessary to get this token from inside the VM.
It starts by setting up several clients using your subscription and credentials.

```javascript
const credentials = new ClientSecretCredential(this.state.domain, this.state.clientId, this.state.secret);
```

### Preliminary operations

This example setup some preliminary components that are no the topic of this sample and do not differ from regular scenarios:

- A Resource Group
- A Virtual Network
- A Subnet
- A Public IP
- A Network Interface

For details about creation of these components, you can refer to the generic samples:
- [Resource Group](https://github.com/Azure-Samples/resource-manager-node-resources-and-groups)
- [Network and VM](https://github.com/Azure-Samples/compute-node-manage-vm)

<a id="create-vm"></a>
### Create a VM with MSI creation

During the creation of the VM, only one attribute is necessary to ask Azure
to assign a MSI ID to the VM.

```typescript
// enable Managed Service Identity.
let identity: VirtualMachineIdentity = {
  type: "SystemAssigned"
};

let vmParameters: VirtualMachine = {
  location: this.location,
  osProfile: osProfile,
  hardwareProfile: hardwareProfile,
  storageProfile: storageProfile,
  networkProfile: networkProfile,
  identity: identity
};

console.log(`\n6.Creating Virtual Machine: ${this.vmName}`);

return await this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
  this.resourceGroupName,
  this.vmName,
  vmParameters
);
```

<a id="role-assignment"></a>
### Role assignement to the MSI credentials

By default, the MSI account created for that VM does not have
any permissions and will be unable to do anything.

This section shows how to get the role id of the built-in role "Contributor"
and to assign it with the scope "Resource Group" to the MSI account.

```typescript
let msiPrincipalId = vm.identity.principalId;
// Get "Contributor" built-in role as a RoleDefinition object
let roleName = "Contributor";
let self = this;

let rolesTask = this.authorizationClient.roleDefinitions.list(rg.id, { filter: `roleName eq ${roleName}` });

let assignRoleTask = rolesTask.then(function assignRole(roles) {
  let contributorRole = roles[0];
  let roleAssignmentParams: AuthorizationModels.RoleAssignmentProperties = {
    principalId: msiPrincipalId,
    roleDefinitionId: contributorRole.id
  };

  // Add RG scope to the MSI token
  return self.authorizationClient.roleAssignments.create(rg.id, uuidv4(), { properties: roleAssignmentParams });
});
```

<a id="extension"></a>
### Install MSI extension

A VM extension is needed to be able to get the token from inside the VM.
This extension is just a simple localhost server on port 50342 that returns the token.

```javascript
// To be able to get the token from inside the VM, there is a service on port 50342 (default). 
// This service is installed by an extension.
let extensionName = "msiextension";
let extension: VirtualMachineExtension = {
  publisher: "Microsoft.ManagedIdentity",
  typePropertiesType: "ManagedIdentityExtensionForLinux",
  typeHandlerVersion: "1.0",
  autoUpgradeMinorVersion: true,
  settings: {
    port: "50342",
  },
  location: self.location
};

return await self.computeClient.virtualMachineExtensions.beginCreateOrUpdateAndWait(
    self.resourceGroupName,
    self.vmName,
    extensionName,
    extension
);
```

<a id="usage"></a>
### Usage

You can now connect to the VM and use the MSI credentials directly, without
passing credentials to the VM.

More details on how to use MSI sith SDK can be found in the 
[MSI usage sample](https://github.com/Azure-Samples/resource-manager-python-manage-resources-with-msi)

Once the Azure VM has been created, you can verify that MSI extension is running on this VM. Managed Service Identity extension will run on 
`localhost` and configured port, here `50342`.

```
notadmin@msi-vm:~$ netstat -tlnp
(Not all processes could be identified, non-owned process info
 will not be shown, you would have to be root to see it all.)
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:50342         0.0.0.0:*               LISTEN      -               
...            

```

Finally, the code in the file 'cleanup.js' deletes the virtual machine created, as well as the resource group.

```javascript
deleteVirtualMachine(function (err, result))
deleteResourceGroup(function (err, result))
```

## More information

Please refer to [Azure SDK for Node](https://github.com/Azure/azure-sdk-for-node) for more information. Additionally, here some other helpful links:

- [Azure Node.js Development Center] (https://azure.microsoft.com/en-us/develop/nodejs/)
- [Azure Virtual Machines documentation](https://azure.microsoft.com/services/virtual-machines/)
- [Learning Path for Virtual Machines](https://docs.microsoft.com/learn/modules/intro-to-azure-virtual-machines/)

If you don't have a Microsoft Azure subscription you can get a FREE trial account [here](http://go.microsoft.com/fwlink/?LinkId=330212).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
