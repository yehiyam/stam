#!/bin/bash
set -ev
if ([ "$TRAVIS_BRANCH" == "master" ] || [ ! -z "$TRAVIS_TAG" ]) && [ "$TRAVIS_PULL_REQUEST" == "false" ]; then
export VERSION=$(npm run version)
curl -X POST -H 'accept:application/json'  -H "authorization:token ${TRAVIS_API_TOKEN}" -H 'content-type:application/json' -H 'travis-api-version:3' \
 -d "{\"request\":{\"branch\":\"master\",\"message\":\"triggered by ${TRAVIS_REPO_SLUG}\", \"config\":{\"merge_mode\":\"deep_merge\",\"env\":{\"VERSION\":\"${VERSION}\"}}}}" \
 "https://api.travis-ci.org/repo/kube-HPC%2Frelease-manager/requests"
else
    echo "version skiped!"
fi