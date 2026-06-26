#!/bin/bash

# Define the port used by the application
PORT=4200

echo "Attempting to stop Angular app on port $PORT..."

PID=$(lsof -ti tcp:"$PORT")

if [ -n "$PID" ]; then
  echo "Found process(es) $PID on port $PORT. Killing them..."
  if kill $PID; then
    echo "Successfully killed process(es) $PID."
  else
    echo "Failed to kill process(es) $PID on port $PORT."
  fi
else
  echo "No process found listening on port $PORT."
fi

echo "Stop script finished."
