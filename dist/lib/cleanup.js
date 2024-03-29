"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const util = require("util");
const identity_1 = require("@azure/identity");
const arm_compute_1 = require("@azure/arm-compute");
const arm_resources_1 = require("@azure/arm-resources");
class State {
    constructor() {
        this.clientId = process.env['CLIENT_ID'];
        this.domain = process.env['DOMAIN'];
        this.secret = process.env['APPLICATION_SECRET'];
        this.subscriptionId = process.env['AZURE_SUBSCRIPTION_ID'];
        this.resourceGroupName = process.argv[2];
        this.vmName = process.argv[3];
    }
}
class Helpers {
    static generateRandomId(prefix) {
        return prefix + Math.floor(Math.random() * 10000);
    }
    static validateEnvironmentVariables() {
        let envs = [];
        if (!process.env['CLIENT_ID'])
            envs.push('CLIENT_ID');
        if (!process.env['DOMAIN'])
            envs.push('DOMAIN');
        if (!process.env['APPLICATION_SECRET'])
            envs.push('APPLICATION_SECRET');
        if (!process.env['AZURE_SUBSCRIPTION_ID'])
            envs.push('AZURE_SUBSCRIPTION_ID');
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
    constructor(state) {
        this.state = state;
    }
    execute() {
        return __awaiter(this, void 0, void 0, function* () {
            let credentials;
            try {
                credentials = new identity_1.ClientSecretCredential(this.state.domain, this.state.clientId, this.state.secret);
                this.resourceClient = new arm_resources_1.ResourceManagementClient(credentials, this.state.subscriptionId);
                this.computeClient = new arm_compute_1.ComputeManagementClient(credentials, this.state.subscriptionId);
                console.log(util.format('\nDeleting virtualMachine : %s. This operation takes time. Hence, please be patient :).', this.state.vmName));
                let result = yield this.computeClient.virtualMachines.beginDeleteAndWait(this.state.resourceGroupName, this.state.vmName);
                console.log('\nDeleting resource group: ' + this.state.resourceGroupName);
                let finalResult = yield this.resourceClient.resourceGroups.beginDeleteAndWait(this.state.resourceGroupName);
            }
            catch (err) {
                return Promise.reject(err);
            }
        });
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        Helpers.validateEnvironmentVariables();
        Helpers.validateParameters();
        let state = new State();
        let driver = new CleanupSample(state);
        return driver.execute();
    });
}
main();
//# sourceMappingURL=cleanup.js.map