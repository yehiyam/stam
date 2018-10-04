const stateManager = require('./states/stateManager');
const jobConsumer = require('./consumer/JobConsumer');
const algoRunnerCommunication = require('./algorunnerCommunication/workerCommunication');
const discovery = require('./states/discovery');
const { stateEvents } = require('../common/consts/events');
const { workerStates, workerCommands } = require('../common/consts/states');
const kubernetes = require('./helpers/kubernetes');
const messages = require('./algorunnerCommunication/messages');
const component = require('../common/consts/componentNames').WORKER;
const { EventMessages } = require('./consts/index');

const Logger = require('@hkube/logger');
let log;
const DEFAULT_STOP_TIMEOUT = 5000;

class Worker {
    constructor() {
        this._stopTimeout = null;
    }

    preInit() {
        log = Logger.GetLogFromContainer();
        this._registerToConnectionEvents();
    }

    async init(options) {
        this._options = options;
        this._registerToCommunicationEvents();
        this._registerToStateEvents();
        this._registerToEtcdEvents();
        this._stopTimeoutMs = options.timeouts.stop || DEFAULT_STOP_TIMEOUT;
        this._setInactiveTimeout();
    }

    _setInactiveTimeout() {
        if (jobConsumer.isConsumerPaused) {
            this._inactiveTimeoutMs = this._options.timeouts.inactivePaused || 0;
        }
        else {
            this._inactiveTimeoutMs = this._options.timeouts.inactive || 0;
        }
        this._handleTimeout(stateManager.state);
    }

    _registerToEtcdEvents() {
        discovery.on(EventMessages.STOP, (res) => {
            log.info(`got stop: ${res.reason}`, { component });
            stateManager.stop();
        });

        discovery.on(workerCommands.stopProcessing, () => {
            if (!jobConsumer.isConsumerPaused) {
                jobConsumer.pause();
                jobConsumer.updateDiscovery({ state: stateManager.state });
                this._setInactiveTimeout();
            }
        });
        discovery.on(workerCommands.startProcessing, () => {
            if (stateManager.state === workerStates.exit) {
                return;
            }
            if (jobConsumer.isConsumerPaused) {
                jobConsumer.resume();
                jobConsumer.updateDiscovery({ state: stateManager.state });
                this._setInactiveTimeout();
            }
        });
    }

    _registerToConnectionEvents() {
        algoRunnerCommunication.on('connection', () => {
            if (stateManager.state === workerStates.exit) {
                return;
            }
            log.info('starting bootstrap state', { component });
            stateManager.bootstrap();
            log.info('finished bootstrap state', { component });
        });
        algoRunnerCommunication.on('disconnect', () => {
            if (stateManager.state === workerStates.exit) {
                return;
            }
            log.warning('algorithm runner has disconnected', { component });
            stateManager.reset();
        });
    }

    /**
     * Register to algoRunner messages.
     */
    _registerToCommunicationEvents() {
        algoRunnerCommunication.on(messages.incomming.initialized, () => {
            stateManager.start();
        });
        algoRunnerCommunication.on(messages.incomming.done, (message) => {
            stateManager.done(message);
        });
        algoRunnerCommunication.on(messages.incomming.stopped, (message) => {
            if (this._stopTimeout) {
                clearTimeout(this._stopTimeout);
            }
            stateManager.done(message);
        });
        algoRunnerCommunication.on(messages.incomming.progress, (message) => {
            if (message.data) {
                log.debug(`progress: ${message.data.progress}`, { component });
            }
        });
        algoRunnerCommunication.on(messages.incomming.error, (message) => {
            log.error(`got error from algorithm. Error: ${message.error}`, { component });
            stateManager.done(message);
        });
    }

    async handleExit(code) {
        try {
            algoRunnerCommunication.send({
                command: messages.outgoing.exit
            });
            const terminated = await kubernetes.waitForTerminatedState(this._options.kubernetes.pod_name, 'algorunner');
            if (terminated) {
                log.info(`algorithm container terminated. Exiting with code ${code}`, { component });
                process.exit(code);
            }
            // if not terminated, kill job
            const jobName = await kubernetes.getJobForPod(this._options.kubernetes.pod_name);
            if (jobName) {
                await kubernetes.deleteJob(jobName);
            }
        }
        catch (error) {
            log.error(`failed to handle exit: ${error}`, { component });
            process.exit(1);
        }
    }

    _handleTimeout(state) {
        if (state === workerStates.ready || state === workerStates.exit) {
            if (this._inactiveTimer) {
                clearTimeout(this._inactiveTimer);
                this._inactiveTimer = null;
            }
            if (this._inactiveTimeoutMs !== 0 && this._inactiveTimeoutMs !== '0') {
                log.info('starting inactive timeout for worker', { component });
                this._inactiveTimer = setTimeout(() => {
                    log.info(`worker is inactive for more than ${this._inactiveTimeoutMs / 1000} seconds.`, { component });
                    stateManager.exit();
                }, this._inactiveTimeoutMs);
            }
        }
        else if (this._inactiveTimer) {
            log.info(`worker is active (${state}). Clearing inactive timeout`, { component });
            clearTimeout(this._inactiveTimer);
            this._inactiveTimer = null;
        }
    }

    _registerToStateEvents() {
        stateManager.on(stateEvents.stateEntered, async ({ job, state, results }) => {
            let pendingTransition = null;
            log.info(`Entering state: ${state}`);
            const result = { state, results };
            this._handleTimeout(state);
            switch (state) {
                case workerStates.exit:
                    this.handleExit(0);
                    break;
                case workerStates.results:
                    await jobConsumer.finishJob(result);
                    pendingTransition = stateManager.cleanup.bind(stateManager);
                    break;
                case workerStates.ready:
                    break;
                case workerStates.init: {
                    const { error, data } = await jobConsumer.extractData(job.data);
                    if (!error) {
                        algoRunnerCommunication.send({
                            command: messages.outgoing.initialize,
                            data
                        });
                    }
                    break;
                }
                case workerStates.working:
                    algoRunnerCommunication.send({
                        command: messages.outgoing.start
                    });
                    break;
                case workerStates.shutdown:
                    break;
                case workerStates.error:
                    break;
                case workerStates.stop:
                    this._stopTimeout = setTimeout(() => {
                        log.error('Timeout exceeded trying to stop algorithm.', { component });
                        stateManager.done('Timeout exceeded trying to stop algorithm');
                        this.handleExit(0);
                    }, this._stopTimeoutMs);
                    algoRunnerCommunication.send({
                        command: messages.outgoing.stop
                    });
                    break;
                default:
            }
            await jobConsumer.updateDiscovery(result);
            if (pendingTransition) {
                pendingTransition();
            }
        });
    }
}

module.exports = new Worker();
