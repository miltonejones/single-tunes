
I want to add a Shazam button somewhere.
   You choose the best place in the UI for the button
   clicking the button opens a modal that listens through the user mic for 5 seconds, capturing the audio
   the audio is posted to the Shazam API
   the result is displayed in the open modal
   the user should have the option to open the result title and artist in the youtube search modal

Shazam API details: 

POST
/api/recognize
Submit audio file or URL for recognition. Returns a UUID to poll.

File Upload
URL
cURL Example
curl -X POST https://shazam-api.com/api/recognize \
  -H "Authorization: Bearer KEY" \
  -F "file=@/path/to/audio.mp3"
JavaScript Example
const formData = new FormData();
formData.append('file', audioFile);

const response = await fetch('https://shazam-api.com/api/recognize', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData
});
const data = await response.json();
Parameters
Parameter	Type	Description
file	File	Audio file (MP3, WAV, FLAC, etc). Max 100MB.
url	String	Audio URL or TikTok/SoundCloud/Mixcloud link.
Either file or url is required.

Response
{
  "uuid": "550e8400-e29b-...",
  "status": "processing"
}
POST
/api/results/{uuid}
Poll until status is "completed".

cURL Example
curl -X POST https://shazam-api.com/api/results/UUID \
  -H "Authorization: Bearer KEY"
JavaScript Polling
async function poll(uuid, key) {
  while (true) {
    const res = await fetch(`https://shazam-api.com/api/results/${uuid}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` }
    });
    const data = await res.json();
    if (data.status === 'completed') return data.results;
    await new Promise(r => setTimeout(r, 3000));
  }
}
Response
{
  "status": "completed",
  "results": [{
    "timecode": "00:00:15",
    "track": {
      "title": "Song Title",
      "subtitle": "Artist"
    }
  }]
}

