const configIt = require('config.rf');
const Logger = require('logger.rf');
const VerbosityPlugin = require('logger.rf').VerbosityPlugin;
const bootstrap = require('../bootstrap')
const stateManager = require('../lib/states/stateManager')
global.stateManager = stateManager;
const messages = require('../lib/algorunnerCommunication/messages')
const expect = require('chai').expect
const sinon = require('sinon');
const workerCommunication = require('../lib/algorunnerCommunication/workerCommunication')
const socketioclient = require('socket.io-client');
const config = {
    workerCommunication:
    {
        adapterName: 'loopback',
        config: {}
    }
}
let log;
describe('worker communication', () => {
    beforeEach(async () => {
        await bootstrap.init();
        await workerCommunication.init(config);
        
    })
    it('should create loopback adapter', async () => {

        await workerCommunication.init(config);
        expect(workerCommunication.adapter.constructor.name).to.equal('LoopbackWorkerCommunication')
    })
    it('should pass events', async () => {
        const spy = sinon.spy();
        const adapter = workerCommunication.adapter;
        workerCommunication.on(messages.incomming.ping, spy)
        adapter.emit(messages.incomming.ping, '1', '2');
        expect(spy.callCount).to.eq(1);
        expect(spy.getCall(0).args).to.eql(['1', '2'])
    })

    it('should pass message.command events', async () => {
        const spy = sinon.spy();
        const adapter = workerCommunication.adapter;
        workerCommunication.on(messages.incomming.initialized, spy)
        expect(stateManager.state).to.equal('ready')
        stateManager.prepare();
        expect(stateManager.state).to.equal('init')
        
        adapter.send({command:messages.outgoing.initialize,data:{xxx:'yyy'}});
        expect(spy.callCount).to.eq(1);
        expect(spy.getCall(0).args[0]).to.eql({xxx:'yyy'})
    })
})