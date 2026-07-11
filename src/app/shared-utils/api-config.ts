export const ANNOUNCE_ENDPOINT = 'https://ismvqzlyrf.execute-api.us-east-1.amazonaws.com';
export const TUNE_API_ENDPOINT = 'https://u8m0btl997.execute-api.us-east-1.amazonaws.com';
export const PHOTO_ENDPOINT = 'https://swkwp5a4m0.execute-api.us-east-1.amazonaws.com/';
export const WIKIMEDIA_SEARCH_ENDPOINT =
  'https://api.wikimedia.org/core/v1/wikipedia/en/search/title';
export const CLOUD_FRONT_URL = 'https://s3.amazonaws.com/box.import/';
export const AI_SEARCH_ENDPOINT = 'https://ohb29b452e.execute-api.us-east-1.amazonaws.com';

// Recorder pipeline: searches YouTube, queues jobs to SQS, and a home poller
// records + uploads the mp3 to box.import (where the catalog ingests it).
// The API key lives only in the recorder-proxy Lambda (see terraform/main.tf);
// the browser calls the proxy on the AI gateway, so no secret ships to clients.
export const RECORDER_API_ENDPOINT = `${AI_SEARCH_ENDPOINT}/recorder`;

// Local recorder API server running on the sandbox EC2. Used when the user
// toggles the recorder to "Local" mode — jobs go to a file-based queue
// instead of SQS, processed by poller-local.sh on the same machine.
export const LOCAL_RECORDER_API_ENDPOINT = 'http://54.87.242.226:3001/recorder';

// Shazam song recognition. The Bearer key lives only in the shazam-proxy
// Lambda (see terraform/main.tf); the browser calls the proxy on the AI
// gateway, so no secret ships to clients.
export const SHAZAM_API_ENDPOINT = `${AI_SEARCH_ENDPOINT}/shazam`;

// GitHub issue reporting. The personal access token lives only in the
// github-proxy Lambda (see terraform/main.tf); the browser calls the proxy
// on the AI gateway, so no secret ships to clients.
export const GITHUB_PROXY_ENDPOINT = `${AI_SEARCH_ENDPOINT}/github`;
