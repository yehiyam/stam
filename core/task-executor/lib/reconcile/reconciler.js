const Logger = require('@hkube/logger');
const log = Logger.GetLogFromContainer();
const { createJobSpec } = require('../jobs/jobCreator');
const kubernetes = require('../helpers/kubernetes');
/**
 * normalizes the worker info from discovery
 * input will look like:
 * <code>
 * {
 *  '/discovery/workers/worker-uuid':{
 *      algorithmName,
 *      workerStatus,
 *      jobStatus,
 *      error
 *      },
 *  '/discovery/workers/worker-uuid2':{
 *      algorithmName,
 *      workerStatus,
 *      jobStatus,
 *      error
 *      }
 * }
 * </code>
 * normalized output should be:
 * <code>
 * {
 *   worker-uuid:{
 *     algorithmName,
 *     workerStatus // ready, working
 * 
 *   }
 * }
 * </code>
 * @param {*} workers 
 */

const normalizeWorkers = (workers) => {
    if (workers == null) {
        return [];
    }
    const workersArray = Object.entries(workers).map(([k, v]) => {
        const workerId = k.match(/([^/]*)\/*$/)[0];
        return {
            id: workerId,
            algorithmName: v.algorithmName,
            workerStatus: v.workerStatus
        };
    });
    return workersArray;
};


const normalizeRequests = (requests) => {
    if (requests == null) {
        return [];
    }
    return requests.map(r => ({ algorithmName: r.alg, pods: r.data.pods }));
};

const normalizeJobs = (jobsRaw) => {
    if (jobsRaw == null) {
        return [];
    }
    const jobs = jobsRaw.body.items.map(j => ({
        name: j.metadata.name,
        algorithmName: j.metadata.labels['algorithm-name'],
        active: j.status.active === 1
    }));
    return jobs;
};

const _createJobs = async (numberOfJobs, jobDetails) => {
    log.debug(`need to add ${numberOfJobs} jobs with details ${JSON.stringify(jobDetails, null, 2)}`);
    const spec = createJobSpec(jobDetails);
    const jobCreateResult = await kubernetes.createJob({ spec });
    return jobCreateResult;
};

const reconcile = async ({ algorithmRequests, algorithmPods, jobs, versions } = {}) => {
    const normPods = normalizeWorkers(algorithmPods);
    const normRequests = normalizeRequests(algorithmRequests);
    const normJobs = normalizeJobs(jobs);
    const createPromises = [];
    normRequests.forEach((r) => {
        const { algorithmName } = r;
        // find workers currently for this algorithm
        const workersForAlgorithm = normJobs.filter(p => p.algorithmName === algorithmName && p.active);
        const podDiff = workersForAlgorithm.length - r.pods;
        if (podDiff > 0) {
            // need to stop some workers
            log.debug(`need to stop ${podDiff} pods for algorithm ${algorithmName}`);
        }
        else if (podDiff < 0) {
            // need to add workers
            const numberOfNewJobs = -podDiff;
            log.debug(`need to add ${numberOfNewJobs} pods for algorithm ${algorithmName}`);
            createPromises.push(_createJobs(numberOfNewJobs, {
                algorithmName,
                algorithmImage: `hkube/algorunner:${versions.versions.find(p => p.project === 'algorunner').tag}`,
                workerImage: `hkube/worker:${versions.versions.find(p => p.project === 'worker').tag}`
            }));
        }
    });

    return Promise.all(createPromises);
};

module.exports = {
    normalizeWorkers,
    normalizeRequests,
    normalizeJobs,
    reconcile,
};
