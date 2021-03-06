const { expect } = require('chai');
const sinon = require('sinon');
const configIt = require('@hkube/config');
const Logger = require('@hkube/logger');
const { main, logger } = configIt.load();
const log = new Logger(main.serviceName, logger);
const config = main;

xdescribe('executor', () => {
    before(async () => {
        const KubernetesApi = require('../lib/helpers/kubernetes');
        await KubernetesApi.init(config);
    });
    describe('executor', () => {
        it('should run interval successfully', async () => {
            const executor = require('../lib/executor');
            const spy1 = sinon.spy(executor, '_interval');
            const spy2 = sinon.spy(executor, '_prepareDriversData');
            const spy3 = sinon.spy(executor, '_algorithmsHandle');
            const spy4 = sinon.spy(executor, '_pipelineDriversHandle');

            await executor.init(config);

            expect(spy1.callCount).to.eql(1);
            expect(spy2.callCount).to.eql(1);
            expect(spy3.callCount).to.eql(1);
            expect(spy4.callCount).to.eql(1);
        });
    });
});
