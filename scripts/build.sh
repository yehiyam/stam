#!/bin/bash
set -ev
echo ${CHANGED}
for REPO in ${CHANGED}
do
  echo ${REPO} changed. Running build
  PRIVATE_REGISTRY=docker.io/yehiyam/hkube lerna run --scope $REPO build
done