### Janus Audio/Video proof of concept

Proof of concept with Janus, Asterisk and Echo/VideoRoom

Idea is to separate audio and video stream and process em with different plugins, so we can have, for example, combined conference with SIP Audio participants and Video.  
For audio mixing Asterisk is used.

Based or acually rework of https://github.com/meetecho/janus-gateway/tree/master/html

Can be used as demo to play around and get some pieces of code for future projects.


To start up, just use
```
# docker-compose up -d
```

Go to http://localhost:8080 in your WebRTC-enabled browser.