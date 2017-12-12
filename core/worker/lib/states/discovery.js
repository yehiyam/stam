const EventEmitter = require('events');
const Etcd = require('@hkube/etcd');
const Logger = require('@hkube/logger');
let log;

class EtcdDiscovery extends EventEmitter {
    constructor() {
        super();
        this._etcd = null;
    }

    async init(options) {
        log = Logger.GetLogFromContainer();
        this._etcd = new Etcd();
        await this._etcd.init(options.etcdDiscovery.init);
        await this._etcd.discovery.register({ serviceName: options.etcdDiscovery.init.serviceName });
        this._etcd.jobs.on('change', (res) => {
            log.info(JSON.stringify(res));
            switch (res.state) {
            case 'stop':
                this.emit('stop', res);
                break;
            default:
                this.emit('change', res);
            }
        });
    }

    async setState(options) {
        const { data } = options;
        await this._etcd.services.set({
            data,
            postfix: 'state'
        });
    }


    async update(options) {
        await this._etcd.tasks.setState(options);
    }

    async watch(options) {
        await this._etcd.jobs.watch(options);
    }
    async unwatch(options) {
        await this._etcd.jobs.unwatch(options);
    }
}

module.exports = new EtcdDiscovery();
