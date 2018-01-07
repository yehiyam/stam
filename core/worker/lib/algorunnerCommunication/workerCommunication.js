const EventEmitter = require('events');
const Logger = require('@hkube/logger');
let log;
const djsv = require('djsv');
const schema = require('./workerCommunicationConfigSchema').workerCommunicationSchema;
const socketAdapter = require('./socketWorkerCommunication');
const loopbackAdapter = require('./loopbackWorkerCommunication');
const { adapters } = require('./consts');
// const forwardEmitter = require('forward-emitter');
const messages = require('./messages');


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
        if (this.adapter) {
            this.adapter.removeAllListeners();
            this.adapter = null;
            this.removeAllListeners();
        }
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
        const AdapterClass = this._adapters[this._options.adapterName];
        if (!AdapterClass) {
            throw new Error(`Invalid worker communication adapter ${this._options.adapterName}`);
        }
        log.info(`Creating communication object of type: ${this._options.adapterName}`);
        this.adapter = new AdapterClass();
        // forwardEmitter(this.adapter, this);
        Object.entries({ ...messages.incomming, connection: 'connection' }).forEach(([name, topic]) => {
            log.info(`workerCommunication registering for topic (${name})=>${topic}`);
            this.adapter.on(topic, (message) => {
                log.info(`workerCommunication got message on topic (${name})=>${topic}, data: ${JSON.stringify(message)}`);
                this.emit(topic, message);
            });
        });
        await this.adapter.init(this._options.config);
    }

    /**
     * 
     * 
     * @param {any} message the message to send to the algoRunner.
     * @param {string} message.command the command for the runner. one of messages.outgoing
     * @param {object} message.data the data for the command
     * @memberof WorkerCommunication
     */
    async send(message) {
        return this.adapter.send(message);
    }
}

module.exports = new WorkerCommunication();
