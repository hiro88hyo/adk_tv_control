#!/bin/bash

node /app/build/index.js --transport=sse
exec sleep infinity