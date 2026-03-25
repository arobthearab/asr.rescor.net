import * as cp from 'child_process/promises';
//import {VitalSigns, VitalSign} from '@rescor-llc/core-utils';
// TODO: this is an experimental higher-level wrapper for VitalSigns

class ServiceWrapper {
  static INVOCATION = Object.freeze({
    FORK: {call: cp.fork, promisify: false},
    EXEC: {call: cp.exec, promisify: false},
    EXECFILE: {call: cp.execFile, promisify: false},
    SPAWN: {call: cp.spawn, promisify: true}
  });

  constructor(service=null, vitalSigns=null, command=null, invocation=ServiceWrapper.INVOCATION.FORK, ...parameters) {
    this.service = service;
    this.vitalSigns = vitalSigns;
    this.command = command;
    this.invocation = invocation;
    this.parameters = parameters; 
  }

  start () {
    
  }
}

export {ServiceWrapper};