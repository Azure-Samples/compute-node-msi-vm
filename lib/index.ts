// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { v4 as uuidv4 } from 'uuid';
import {
    ComputeManagementClient,
    VirtualMachine,
    VirtualMachineImageResource,
    OSProfile,
    HardwareProfile,
    ImageReference,
    StorageProfile,
    NetworkProfile,
    VirtualMachineIdentity,
    VirtualMachineExtension,
} from '@azure/arm-compute';
import {
    StorageManagementClient,
    StorageAccount,
    StorageAccountCreateParameters,
} from '@azure/arm-storage';
import {
    NetworkManagementClient,
    VirtualNetwork,
    PublicIPAddress,
    NetworkInterface,
    Subnet,
} from '@azure/arm-network';
import { AuthorizationManagementClient } from '@azure/arm-authorization';
import { ResourceManagementClient, ResourceGroup } from '@azure/arm-resources';
import { ClientSecretCredential } from '@azure/identity';

class State {
  public clientId: string = process.env['CLIENT_ID'];
  public domain: string = process.env['DOMAIN'];
  public secret: string = process.env['APPLICATION_SECRET'];
  public subscriptionId: string = process.env['AZURE_SUBSCRIPTION_ID'];
}

class VMSample {
  private resourceGroupName = Helpers.generateRandomId('testrg');
  private vmName = Helpers.generateRandomId('testvm');
  private storageAccountName = Helpers.generateRandomId('testacc');
  private vnetName = Helpers.generateRandomId('testvnet');
  private subnetName = Helpers.generateRandomId('testsubnet');
  private publicIPName = Helpers.generateRandomId('testpip');
  private networkInterfaceName = Helpers.generateRandomId('testnic');
  private ipConfigName = Helpers.generateRandomId('testcrpip');
  private domainNameLabel = Helpers.generateRandomId('testdomainname');
  private osDiskName = Helpers.generateRandomId('testosdisk');

  private location = 'westus';
  private adminUserName = 'notadmin';
  private adminPassword = 'Pa$$w0rd92234';

  private resourceClient: ResourceManagementClient;
  private computeClient: ComputeManagementClient;
  private storageClient: StorageManagementClient;
  private networkClient: NetworkManagementClient;
  private authorizationClient: AuthorizationManagementClient;

  // Ubuntu config
  private ubuntuConfig = {
    publisher: 'Canonical',
    offer: 'UbuntuServer',
    sku: '16.04.0-LTS',
    osType: 'Linux'
  };

  constructor(public state: State) {
  }

  async execute(): Promise<VirtualMachine> {
    let credentials;
    try {
      credentials = new ClientSecretCredential(this.state.domain, this.state.clientId, this.state.secret);
      this.resourceClient = new ResourceManagementClient(credentials, this.state.subscriptionId);
      this.computeClient = new ComputeManagementClient(credentials, this.state.subscriptionId);
      this.storageClient = new StorageManagementClient(credentials, this.state.subscriptionId);
      this.networkClient = new NetworkManagementClient(credentials, this.state.subscriptionId);
      this.authorizationClient = new AuthorizationManagementClient(credentials, this.state.subscriptionId);
      let vm = await this.createVM();
      console.log(`VM creation successful: ${vm.name} is ready.`)
      return Promise.resolve(vm);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private async createVM(): Promise<VirtualMachine> {
    return await this.createResourceGroup()
      .then(async (rg) => {
        let storageTask = await this.createStorageAccount();
        let subnetTask = this.createVnet();
        let nicTask = subnetTask.then(async () => await this.createNIC());
        let vmTask = Promise.all([storageTask, subnetTask, nicTask])
          .then(async () => await this.createVirtualMachine());
        vmTask.then((vm) => this.FinalizeMSISetup(rg, vm));
        return vmTask;
      });
  }

  private createResourceGroup(): Promise<ResourceGroup> {
    let groupParameters: ResourceGroup = {
      location: this.location
    };

    console.log(`\n1.Creating resource group: ${this.resourceGroupName}`);

    return this.resourceClient.resourceGroups.createOrUpdate(this.resourceGroupName, groupParameters);
  }

  private async createStorageAccount(): Promise<StorageAccount> {
    let storageAcctParams: StorageAccountCreateParameters = {
      location: this.location,
      sku: {
        name: 'Standard_LRS',
      },
      kind: 'storage',
    };

    console.log(`\n2.Creating storage account: ${this.storageAccountName}`);
    return await this.storageClient.storageAccounts.beginCreateAndWait(
        this.resourceGroupName,
        this.storageAccountName,
        storageAcctParams
    );
    
  }

  private async createVnet(): Promise<VirtualNetwork> {
    let vnetParams: VirtualNetwork = {
      location: this.location,
      addressSpace: {
        addressPrefixes: ['10.0.0.0/16']
      },
      subnets: [{ name: this.subnetName, addressPrefix: '10.0.0.0/24' }],
    };

    console.log(`\n3.Creating vnet: ${this.vnetName}`);

    await this.networkClient.virtualNetworks.beginCreateOrUpdateAndWait(
        this.resourceGroupName,
        this.vnetName,
        vnetParams
    );
    return await this.networkClient.virtualNetworks.get(
        this.resourceGroupName,
        this.vnetName
    );
  }

  private async getSubnetInfo(): Promise<Subnet> {
    return await this.networkClient.subnets.get(
        this.resourceGroupName,
        this.vnetName,
        this.subnetName
    );
  }

  private async createPublicIP(): Promise<PublicIPAddress> {
    let publicIPParameters: PublicIPAddress = {
      location: this.location,
      publicIPAllocationMethod: 'Dynamic',
      dnsSettings: {
        domainNameLabel: this.domainNameLabel
      }
    };

    console.log(`\n4.Creating public IP: ${this.publicIPName}`);

    await this.networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
        this.resourceGroupName,
        this.publicIPName,
        publicIPParameters
    );
    return await this.networkClient.publicIPAddresses.get(
        this.resourceGroupName,
        this.publicIPName
    );
  }

  private async createNIC(): Promise<NetworkInterface> {
    let subnetTask = this.getSubnetInfo();
    let ipTask = this.createPublicIP();

    return Promise.all([subnetTask, ipTask])
      .then(async ([s, ip]) => {
        console.log(`\n5.Creating Network Interface: ${this.networkInterfaceName}`);

        let subnet: Subnet = s;
        let publicIp: PublicIPAddress = ip;
        let nicParameters = {
          location: this.location,
          ipConfigurations: [
            {
              name: this.ipConfigName,
              privateIPAllocationMethod: 'Dynamic',
              subnet: subnet,
              publicIPAddress: publicIp
            }
          ]
        };
        await this.networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
            this.resourceGroupName,
            this.networkInterfaceName,
            nicParameters
        );
        return this.networkClient.networkInterfaces.get(
            this.resourceGroupName,
            this.networkInterfaceName
        );
      });
  }

  private findVMImage(): Promise<VirtualMachineImageResource[]> {
    return this.computeClient.virtualMachineImages.list(this.location,
      this.ubuntuConfig.publisher,
      this.ubuntuConfig.offer,
      this.ubuntuConfig.sku,
      { top: 1 });
  }

  private getNICInfo(): Promise<NetworkInterface> {
    return this.networkClient.networkInterfaces.get(this.resourceGroupName, this.networkInterfaceName);
  }

  private createVirtualMachine(): Promise<VirtualMachine> {
    let nicTask = this.getNICInfo();
    let findVMTask = this.findVMImage();

    return Promise.all([nicTask, findVMTask])
      .then(([nic, img]) => {

        let nicId: string = nic.id;
        let vmImageVersionNumber: string = img[0].name;

        let osProfile: OSProfile = {
          computerName: this.vmName,
          adminUsername: this.adminUserName,
          adminPassword: this.adminPassword
        };

        let hardwareProfile: HardwareProfile = {
          vmSize: 'Standard_DS2_v2'
        };

        let imageReference: ImageReference = {
          publisher: this.ubuntuConfig.publisher,
          offer: this.ubuntuConfig.offer,
          sku: this.ubuntuConfig.sku,
          version: vmImageVersionNumber
        };

        let storageProfile: StorageProfile = {
          imageReference: imageReference
        };

        let networkProfile: NetworkProfile = {
          networkInterfaces: [
            {
              id: nicId,
              primary: true
            }
          ]
        };

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

        return this.computeClient.virtualMachines.beginCreateOrUpdateAndWait(
          this.resourceGroupName,
          this.vmName,
          vmParameters);
      });
  }

  private async FinalizeMSISetup(rg: ResourceGroup, vm: VirtualMachine): Promise<VirtualMachineExtension> {
    console.log(`\n7. Finalizing MSI set up on the Virtual Machine: ${this.vmName}`);

    // By default, the MSI account has no permissions, the next part is assignment of permissions to the account
    // An example is Resource Group access as Contributor.
    let msiPrincipalId = vm.identity.principalId;
    let roleName = "Contributor";
    let self = this;

    let rolesTask = this.authorizationClient.roleDefinitions.list(rg.id, { filter: `roleName eq ${roleName}` });

    let assignRoleTask = rolesTask.then(function assignRole(roles) {
      let contributorRole = roles[0];
      let roleAssignmentParams = {
        principalId: msiPrincipalId,
        roleDefinitionId: contributorRole.id
      };

      return self.authorizationClient.roleAssignments.create(rg.id, uuidv4(), roleAssignmentParams);
    });

    let installMSITask = assignRoleTask.then(async function installMSIExtension(role) {
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
    });

    installMSITask.then(function displayConnInfo() {
      console.log('');
      // print login/connection info.
      let publicIPTask = self.networkClient.publicIPAddresses.get(self.resourceGroupName, self.publicIPName);
      publicIPTask.then(function _(publicIp) {
        console.log("you can connect to the VM using:");
        console.log(`ssh ${self.adminUserName}@${publicIp.ipAddress}. The password is ${self.adminPassword}`);
      });
    });


    return installMSITask;
  }
}

class Helpers {
  static generateRandomId(prefix: string): string {
    return prefix + Math.floor(Math.random() * 10000);
  }

  static validateEnvironmentVariables(): void {
    let envs = [];
    if (!process.env['CLIENT_ID']) envs.push('CLIENT_ID');
    if (!process.env['DOMAIN']) envs.push('DOMAIN');
    if (!process.env['APPLICATION_SECRET']) envs.push('APPLICATION_SECRET');
    if (!process.env['AZURE_SUBSCRIPTION_ID']) envs.push('AZURE_SUBSCRIPTION_ID');
    if (envs.length > 0) {
      throw new Error(`please set/export the following environment variables: ${envs.toString()}`);
    }
  }
}

async function main(): Promise<void> {
  Helpers.validateEnvironmentVariables();
  let state = new State();
  let driver = new VMSample(state);
  await driver.execute();
}

// Entry point.
main();