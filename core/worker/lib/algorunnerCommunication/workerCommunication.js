const EventEmitter = require('events');
const Logger = require('logger.rf');
let log;
const djsv = require('djsv');
const schema = require('./workerCommunicatioConfigSchema').workerCommunicationSchema;
const socketAdapter = require('./socketWorkerCommunication');
const loopbackAdapter = require('./loopbackWorkerCommunication');
const adapters = require('./consts').adapters;
const forward_emitter = require('forward-emitter');
class WorkerCommunication extends EventEmitter {
    constructor() {
        super();
        this._options = null;
        this._adapters = {};
        this._adapters[adapters.socket] = socketAdapter;
        this._adapters[adapters.loopback] = loopbackAdapter;
        this.adapter = null;
    }
    async init(options) {
        log = Logger.GetLogFromContainer();
        options = options || {};
        const validator = djsv(schema);
        const validatedOptions = validator(options.workerCommunication);
        if (validatedOptions.valid) {
            this._options = validatedOptions.instance;
        }
        else {
            throw new Error(validatedOptions.errorDescription);
        }
        const adapterClass = this._adapters[this._options.adapterName];
        if (!adapterClass) {
            throw new Error(`Invalid worker communication adapter ${this._options.adapterName}`);
        }
        log.info(`Creating communication object of type: ${this._options.adapterName}`);
        this.adapter = new adapterClass();
        await this.adapter.init(this._options.config);
        forward_emitter(this.adapter, this);

    }
}

module.exports = new WorkerCommunication();