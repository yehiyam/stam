#!/usr/bin/env node
const { getPackages } = require("@lerna/project");
const Octokit = require('@octokit/rest')
const jsyaml = require('js-yaml')
const fs = require('fs');
const { promisify } = require('util');
const request = require('request-promise');
const writeFile = promisify(fs.writeFile);
const packageVersion = require('../package.json').version;

const HKUBE = 'yehiyam'
const HKUBE_REPO = 'stam'


const main = async () => {
    try {


        const octokit = new Octokit({
            // debug: true,
            headers: {
                'Accept': ' application/vnd.github.mercy-preview+json'
            }
        })

        if (process.env.GH_TOKEN) {
            octokit.authenticate({
                type: 'oauth',
                token: process.env.GH_TOKEN || undefined
            })

        }

        const cwd = process.cwd();
        const pkgs = await getPackages(cwd);

        const versions = pkgs.map(node => ({
            project: node.name,
            tag: `v${node.version}`
        }));
        const output = {
            systemVersion: packageVersion,
            versions: versions
        }
        await writeFile('version.json', JSON.stringify(output, null, 2));
        const yamlVersions = jsyaml.safeDump(versions.reduce((acc, cur, i) => {
            const key = cur.project; // add this to change - to _ .replace(/-/g,'_')
            acc[key] = {
                image: {
                    tag: cur.tag
                }
            };
            return acc;
        }, {
                systemversion: packageVersion
            }));
        await writeFile('version.yaml', yamlVersions);

        // const tagRefResponse = await octokit.repos.createRelease({
        //     owner: HKUBE,
        //     repo: HKUBE_REPO,
        //     tag_name: `v${packageVersion}`,
        //     name: packageVersion,
        // })

        // const uploadRes = await octokit.repos.uploadReleaseAsset({
        //     owner: HKUBE,
        //     repo: HKUBE_REPO,
        //     url: tagRefResponse.data.assets_url,
        //     filePath: './version.json',
        //     name: 'version.json',
        //     label: 'Version Description'
        // })
        // const uploadResYaml = await octokit.repos.uploadReleaseAsset({
        //     owner: HKUBE,
        //     repo: HKUBE_REPO,
        //     id: tagRefResponse.data.id,
        //     filePath: './version.yaml',
        //     name: 'version.yaml',
        //     label: 'Version Description yaml'
        // })
        // console.log(release)
    } catch (error) {
        console.error(error)
        process.exit(1);
    }
};

main();