// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as process from 'process';
import * as util from 'util';

import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient } from '@azure/arm-compute';
import { ResourceManagementClient } from '@azure/arm-resources';

class State {
  public clientId: string = process.env['CLIENT_ID'];
  public domain: string = process.env['DOMAIN'];
  public secret: string = process.env['APPLICATION_SECRET'];
  public subscriptionId: string = process.env['AZURE_SUBSCRIPTION_ID'];
  public resourceGroupName: string = process.argv[2];
  public vmName: string = process.argv[3];
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

  static validateParameters() {
    if (!process.argv[2] || !process.argv[3]) {
      throw new Error('Please provide the resource group and the virtual machine name by executing the script as follows: "node dist/lib/cleanup.js <resourceGroupName> <vmName>".');
    }
  }
}

class CleanupSample {

  private resourceClient: ResourceManagementClient;
  private computeClient: ComputeManagementClient;

  constructor(public state: State) {
  }

  async execute(): Promise<void> {
    let credentials;
    try {
      credentials = new ClientSecretCredential(
          this.state.domain,
          this.state.clientId,
          this.state.secret
      );
      this.resourceClient = new ResourceManagementClient(credentials, this.state.subscriptionId);
      this.computeClient = new ComputeManagementClient(credentials, this.state.subscriptionId);
      console.log(util.format('\nDeleting virtualMachine : %s. This operation takes time. Hence, please be patient :).', this.state.vmName));
      let result = await this.computeClient.virtualMachines.beginDeleteAndWait(this.state.resourceGroupName, this.state.vmName);
      console.log('\nDeleting resource group: ' + this.state.resourceGroupName);
      let finalResult = await this.resourceClient.resourceGroups.beginDeleteAndWait(this.state.resourceGroupName);
    } catch (err) {
      return Promise.reject(err);
    }
  }
}

async function main(): Promise<void> {
  Helpers.validateEnvironmentVariables();
  Helpers.validateParameters();
  let state = new State();
  let driver = new CleanupSample(state);
  return driver.execute();
}

//Entrypoint
main();