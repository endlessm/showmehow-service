#!/bin/bash
set -e
set -x
rm -rf var metadata export build

BRANCH=${BRANCH:-master}
GIT_CLONE_BRANCH=${GIT_CLONE_BRANCH:-HEAD}
RUN_TESTS=${RUN_TESTS:-false}
REPO=${REPO:repo}

sed \
  -e "s|@BRANCH@|${BRANCH}|g" \
  -e "s|@GIT_CLONE_BRANCH@|${GIT_CLONE_BRANCH}|g" \
  -e "s|\"@RUN_TESTS@\"|${RUN_TESTS}|g" \
  com.endlessm.ShowmehowService.json.in \
  > com.endlessm.ShowmehowService.json

flatpak-builder build --ccache com.endlessm.ShowmehowService.json
flatpak build-export ${REPO} build ${BRANCH}
flatpak build-bundle ${REPO} com.endlessm.ShowmehowService.flatpak com.endlessm.ShowmehowService
