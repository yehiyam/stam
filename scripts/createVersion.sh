#!/bin/bash
set -ev
if ([ "$TRAVIS_BRANCH" == "master" ] || [ ! -z "$TRAVIS_TAG" ]) && [ "$TRAVIS_PULL_REQUEST" == "false" ]; then
    git config --global user.email "travis@travis-ci.org"
    git config --global user.name "Travis CI"
    git remote set-url --push origin "https://${GH_TOKEN}@github.com/${TRAVIS_REPO_SLUG}.git"
    git remote -v
    git status
    git checkout -f -b version-branch
    # npm version patch -m "$(git log -1 --pretty=%B) .... bump version [skip ci]"
    MESSAGE="$(git log -1 --pretty=%B) .... bump version [skip ci]"
    lerna version patch --no-push --yes --no-git-tag-version --no-commit-hooks -m "${MESSAGE}"
    lerna exec "npm install -s --ignore-scripts --package-lock-only --no-audit"
    git add core/*/package-lock.json 
    git add core/*/package.json 
    git commit -m "${MESSAGE}"
    npm version patch --git-tag-version --commit-hooks=false -m "${MESSAGE}"
    git push origin version-branch:master --follow-tags
  else
    echo "version skiped!"
  fi