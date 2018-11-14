const { expect } = require('chai');
// const sinon = require('sinon');
const chai = require('chai');
const mockery = require('mockery');
const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const storageManager = require('@hkube/storage-manager');
const { main, logger } = configIt.load();
log = new Logger(main.serviceName, logger);
const messages = require('../lib/algorunnerCommunication/messages');
const jobConsumer = require('../lib/consumer/JobConsumer');
const { workerStates } = require('../lib/consts/states');
const { stateEvents } = require('../lib/consts/events');
const { EventMessages } = require('../lib/consts/index');

let workerCommunication;
let stateManager;

/*
 * code snipets for eval algorithm
 */

const incCode = [
    "function doInc(input) {",
    "return input[0] + 1;",
    "}"
];

const squareCode = [
    "function doSquare(input) {",
    "return input[0] * input[0];",
    "}"
];

const doubleCode = [
    "function doDouble(input) {",
    "return 2 * input[0];",
    "}"
];

const longCode = [
    "async function delay(input) {",
    "await new Promise(resolve => setTimeout(resolve, 30000));",
    "console.log('code stopped')",
    "return input[0];",
    "}"
]

const buggyCondCode = [
    "(input[0] > 10);" // buggy: not a function!
];

const gt10CondCode = [
    "function isGt10(input) {",
    "return (input[0] > 10);",
    "}"
];

/**
 * Create pipeline with one Eval algorithm
 * @param {string} name 
 * @param {Array} codeArray 
 * @param {object} subPipeline 
 */
function createOneAlgPipeline(name, codeArray) {
    if (codeArray.length === 0) {
        return;
    }
    let pipeline = {
        "name": name,
        "nodes": [
            {
                "nodeName": "noname",
                "algorithmName": "eval-alg",
                "input": ["@flowInput.data"],
                "extraData": {
                    "code": codeArray
                }
            }
        ],
        "options": {
            "batchTolerance": 100,
            "progressVerbosityLevel": "debug"
        },
        "webhooks": {
            "progress": "http://monitor-server:30010/webhook/progress",
            "result": "http://monitor-server:30010/webhook/result"
        }
    }
    return pipeline;
}

/**
 * Create algorithm data with eval code and 2 conditional sub pipelines (with condition expression code) .
 * Eval Algorithm flow for such data: 
 * 1. eval codeArray
 * 2. eval conditionCodeArray
 * 3. if true start single eval algorithm subpipeline with trueCodeArray
 * 4. else start single eval algorithm subpipeline with falseCodeArray
 * @param {*} input input for algorithm.
 * @param {Array} codeArray code for eval algorithm.
 * @param {Array} conditionCodeArray condition expression code
 * @param {Array} trueCodeArray code for sub pipeline single eval algorithm to perform when condition eval is true.
 * @param {Array} falseCodeArray code for sub pipeline single eval algorithm to perform when condition eval is false.
 */
function createAlgDataWithConditionalSubPipelines(input, codeArray, conditionCodeArray = [], trueCodeArray = [], falseCodeArray = []) {
    let algData = {
        'input': input,
        'info': {
            'extraData': {
                'code': codeArray
            }
        }
    }
    if (conditionCodeArray) {
        algData.info.extraData.conditionCode = conditionCodeArray;
        algData.info.extraData.trueSubPipeline = createOneAlgPipeline('trueSubPipeline', trueCodeArray);
        algData.info.extraData.falseSubPipeline = createOneAlgPipeline('falseSubPipeline', falseCodeArray);
    }
    return algData;
}

/**
 * This suite tests the worker subpipeline support (using algorunner mock).
 */
describe('worker SubPipeline test', () => {
    before(async () => {
        mockery.enable({
            warnOnReplace: false,
            warnOnUnregistered: false,
            useCleanCache: true
        });
        mockery.registerSubstitute('./loopbackWorkerCommunication', process.cwd() + '/test/mocks/algorunner-mock.js');
        mockery.registerSubstitute('../helpers/api-server-client', process.cwd() + '/test/mocks/api-server-mock.js');
        mockery.registerSubstitute('./states/stateManager', process.cwd() + '/test/mocks/stateManager.js');
        mockery.registerSubstitute('../states/stateManager', process.cwd() + '/test/mocks/stateManager.js'); // from subpipeline.js


        const bootstrap = require('../bootstrap');
        workerCommunication = require('../lib/algorunnerCommunication/workerCommunication');
        stateManager = require('./mocks/stateManager');
        await storageManager.init(main, true);
        await bootstrap.init();
    });
    beforeEach(() => {
        workerCommunication.removeAllListeners(messages.incomming.done);
        workerCommunication.removeAllListeners(messages.incomming.error);
        workerCommunication.removeAllListeners(messages.incomming.initialized);
    });
    after(async () => {
        mockery.disable();
    });
    it('alg without subpipeline should accept right result', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            expect(message.data).to.equal(2 * input[0]);
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            chai.assert.fail('error', 'done', `got error ${message.error.message}`)
            done();
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode)
        adapter.send({ command: messages.outgoing.initialize, data: algData });
    });
    xit('alg with true condition should run trueSubPipeline', function (done) {
        this.timeout(8000);
        const { adapter } = workerCommunication;
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            expect(message.data).to.equal((2 * input[0]) + 1);  // validate result
            expect(adapter.getStartedSubPipelineId()).to.equal('trueSubPipeline'); // ensure startedSubPipeline msg
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            chai.assert.fail('error', 'done', `got error ${message.error.message}`)
            done();
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, incCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
    });
    xit('alg with false condition should run falseSubPipeline', function (done) {
        this.timeout(8000);
        const { adapter } = workerCommunication;
        const input = [4];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            expect(message.data).to.equal(Math.pow((2 * input[0]), 2)); // validate result
            expect(adapter.getStartedSubPipelineId()).to.equal('falseSubPipeline'); // ensure startedSubPipeline msg
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            chai.assert.fail('error', 'done', `got error ${message.error.message}`)
            done();
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, incCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
    });
    it('alg with buggy condition should fail', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const input = [4];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            chai.assert.fail('error', 'done', `got done for buggy condition`)
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            done(); // expect error!
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, buggyCondCode, incCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
    });
    it('alg with buggy subpipeline should fail', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const input = [4];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            chai.assert.fail('error', 'done', `got done for buggy condition`)
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            done(); // expect error!
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, buggyCondCode, buggyCondCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
    });
    it('external subPipeline stop should complete with error (according to algorunner)', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            chai.assert.fail('error', 'done', `should be error as subPipeline stopped`);
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            done(); // expect error!
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, longCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
        setTimeout(() => {
            adapter.send({ command: messages.outgoing.subPipelineStopped, subPipelineId: adapter.getStartedSubPipelineId() });
        }, 2000);
    });
    it('subPipeline stop from alg should stop the subPipeline', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const apiServerMock = require('./mocks/api-server-mock');
        const subPipelineHandler = require('../lib/subpipeline/subpipeline');
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, longCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
        setTimeout(() => {
            const algSubPipelineId = adapter.getStartedSubPipelineId();
            const subPipelineJobId = subPipelineHandler.getSubPipelineJobId(algSubPipelineId);
            adapter.simulateStopSubPipeline(algSubPipelineId, 'simulate stop subPipelien by test');
            // ensure subPipeline was stopped
            expect(apiServerMock.isStopped(subPipelineJobId));
            done();
        }, 2000);
    });
    it('unknown subPipelineStop from alg should send subPipelineError (expect error from algorunner)', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        workerCommunication.on(messages.incomming.done, (message) => {
            chai.assert.fail('error', 'done', `should be error as got stopSubPipeline for unknown Id`);
            done();
        });
        workerCommunication.on(messages.incomming.error, (message) => {
            done(); // expect error!
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, longCode, squareCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
        setTimeout(() => {
            adapter.simulateStopSubPipeline('invalidSubPipelineId', 'simulate stop unknown subPipelien by test');
        }, 2000);
    });
    it('stopping algorithm should stop subPipeline', function (done) {
        this.timeout(5000);
        const { adapter } = workerCommunication;
        const apiServerMock = require('./mocks/api-server-mock');
        const subPipelineHandler = require('../lib/subpipeline/subpipeline');
        const input = [10];
        workerCommunication.on(messages.incomming.initialized, (message) => {
            stateManager.state = workerStates.working;
            adapter.send({ command: messages.outgoing.start });
        });
        let algData = createAlgDataWithConditionalSubPipelines(input, doubleCode, gt10CondCode, longCode);
        adapter.send({ command: messages.outgoing.initialize, data: algData });
        setTimeout(() => {
            // stop pipeline
            const discovery = require('../lib/states/discovery');
            const subPipelineJobId = subPipelineHandler.getSubPipelineJobId('trueSubPipeline');
            discovery.emit(EventMessages.STOP, { jobId: jobConsumer.jobId, reason: 'test' });
            // ensure subPipeline was stopped
            expect(apiServerMock.isStopped(subPipelineJobId));
            done();
        }, 2000);
    });
    it('enter results/error/init state should clear subPipelines data', function (done) {
        const subPipelineHandler = require('../lib/subpipeline/subpipeline');
        // simule 2 subPipelines
        subPipelineHandler._jobId2InternalIdMap.set('subPipelineJob1', 'sub1').set('subPipelineJob2', 'sub2')
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(2);
        stateManager.emit(stateEvents.stateEntered, { state: workerStates.results });
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(0);

        subPipelineHandler._jobId2InternalIdMap.set('subPipelineJob1', 'sub1').set('subPipelineJob2', 'sub2')
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(2);
        stateManager.emit(stateEvents.stateEntered, { state: workerStates.error });
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(0);

        subPipelineHandler._jobId2InternalIdMap.set('subPipelineJob1', 'sub1').set('subPipelineJob2', 'sub2')
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(2);
        stateManager.emit(stateEvents.stateEntered, { state: workerStates.init, job: { data: 1 } });
        expect(subPipelineHandler._jobId2InternalIdMap.size).equals(0);
        done();
    });
});
