# SmarterGhost demo video — shot list (target: 2m30s, hard cap 3:00)

Recording plan: puppeteer-core driving the deployed app in headless Chrome
(/usr/bin/google-chrome), scripted interactions + CDP screencast to webm,
ffmpeg to trim/convert to mp4 1080p. Upload to YouTube on the arjun.vinod0028
channel (scoped grant), unlisted=false (public), project-limited content only.

## Shots

1. (0:00-0:10) Title card: "SmarterGhost — resurrecting the AIM chatbot" +
   the live URL. Voiceover/text: "SmarterChild died in 2017. I brought it back."
2. (0:10-0:30) Desktop view: buddy list with SmarterGhost online, click opens
   the IM window. Show the greeting. Point out Win95 chrome, buddy icons,
   sound toggle.
3. (0:30-1:00) Free-text chat: type "hey, what were you up to since 2017?"
   Show the typing indicator and STREAMING AI reply (persona, no markdown).
4. (1:00-1:40) Commands montage (fast cuts, real output):
   - /weather kochi — live weather
   - /wiki instant messaging — summary + link
   - /define nostalgia
   - /news — live HN headlines
5. (1:40-2:10) Reminders + away: /remind 10s check the oven, /away grabbing
   lunch — buddy list moves "You" to Away group — then the reminder pops
   in-chat at 10s (door sound if enabled).
6. (2:10-2:25) Mobile view (375px): collapsed buddy list, tap to expand,
   same chat works.
7. (2:25-2:35) Closing card: "Built with Kiro spec-driven development —
   Cloudflare Workers + Workers AI + KV. github.com/ArjunAJ7/smarterghost"

## Notes
- All content is the app itself; no personal data on screen. Fresh session
  (cleared localStorage) before recording.
- No fabricated output: everything recorded live against the deployed worker.
