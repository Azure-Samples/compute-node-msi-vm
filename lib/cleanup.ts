// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as msRest from 'ms-rest';
import * as msRestAzure from 'ms-rest-azure';
import * as process from 'process';
import * as util from 'util';
import uuidv4 = require('uuid/v4');

import ComputeManagementClient = require('azure-arm-compute');
import { ResourceManagementClient, ResourceModels } from 'azure-arm-resource';

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
      throw new Error('Please provide the resource group and the virtual machine name by executing the script as follows: "node cleanup.js <resourceGroupName> <vmName>".');
    }
  }
}

var resourceGroupName = process.argv[2];
var vmName = process.argv[3];
var resourceClient, computeClient;

function deleteVirtualMachine(callback) {
  console.log(util.format('\nDeleting virtualMachine : %s. This operation takes time. Hence, please be patient :).', vmName));
  return computeClient.virtualMachines.deleteMethod(resourceGroupName, vmName, callback);
}

function deleteResourceGroup(callback) {
  console.log('\nDeleting resource group: ' + resourceGroupName);
  return resourceClient.resourceGroups.begindeleteMethod(resourceGroupName, callback);
}


Helpers.validateEnvironmentVariables();
Helpers.validateParameters()

//Entrypoint of the cleanup script
msRestAzure.loginWithServicePrincipalSecret(clientId, secret, domain, function (err, credentials) {
  if (err) return console.log(err);
  resourceClient = new ResourceManagementClient(credentials, subscriptionId);
  computeClient = new ComputeManagementClient(credentials, subscriptionId);
  deleteVirtualMachine(function (err, result) {
    if (err) return console.log('Error occured in deleting the virtual machine: ' + vmName + '\n' + util.inspect(err, { depth: null }));
    console.log('Successfully deleted the virtual machine: ' + vmName);
    console.log('\nDeleting the resource group can take few minutes, so please be patient :).');
    deleteResourceGroup(function (err, result) {
      if (err) return console.log('Error occured in deleting the resource group: ' + resourceGroupName + '\n' + util.inspect(err, { depth: null }));
      console.log('Successfully deleted the resourcegroup: ' + resourceGroupName);
    });
  });
});