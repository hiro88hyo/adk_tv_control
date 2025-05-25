#!/bin/bash

cd /app 
uv run adk web --host 0.0.0.0
exec sleep infinity