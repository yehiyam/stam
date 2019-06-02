#!/bin/bash
set -ev
echo ${DOCKER_HUB_PASS} | docker login --username yehiyam --password-stdin
for REPO in ${CHANGED}
do
  echo ${REPO} changed. Running build
  PRIVATE_REGISTRY=docker.io/yehiyam lerna run --scope $REPO build
done