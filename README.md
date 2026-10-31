## Field Reports

A React Native app for one inspector on a bad connection. A report is a short note and one to five photos. Saving it on the phone and getting it onto the server are two different facts, and the screen never treats them as the same thing.

## Run it

You need Node 22+, JDK 17, and the Android SDK. This was checked with React Native 0.88.

Terminal 1, from `server`:

```bash
npm install
npm start
```

The server listens on `http://0.0.0.0:8787`.

Terminal 2, from the project root:

```bash
npm install
npm start
```

Terminal 3:

```bash
npm run android
```

The emulator reaches the computer at `http://10.0.2.2:8787` (`src/config.ts`).

On a phone plugged in over USB:

```bash
adb reverse tcp:8787 tcp:8787
```

Then change `API_URL` in `src/config.ts` to `http://127.0.0.1:8787` and reload.

## Tests

The upload rules run with no screen:

```bash
npm test
```

The server rules, including a duplicate upload and the failure switch:

```bash
npm run test:server
```

## Make it fail

On the home screen, **Make the server fail** arms the next upload requests:

| Button | What the server does |
| --- | --- |
| Normal | Answers again |
| Slow | Waits, then answers. Bytes still count as progress |
| Drop twice | Cuts the next two upload connections |
| Refuse | Answers 503 |
| Hang | Never answers. The app gives up after 20 seconds with no bytes, then tries again |

Same switch from the shell:

```bash
curl -X POST http://127.0.0.1:8787/v1/fault -H "Content-Type: application/json" -d "{\"mode\":\"drop\",\"requests\":2}"
```

`mode` is `off`, `slow`, `drop`, `refuse`, or `hang`.

To wipe the demo server, not the phone:

```bash
curl -X DELETE http://127.0.0.1:8787/v1/reports
```

**Clear this phone** deletes the queue and the photo files on the device. Reports already on the server stay there.

## What the main scenario does

1. Turn on airplane mode.
2. Save three reports. One of them can have five camera photos.
3. Force-quit. Open the app. The reports are still **Saved on this phone**.
4. Turn the connection back on. Drop it twice while a photo is sending.
5. All three reports end on the server once. Every photo is under 5 MB.

A 2G link is slow, not a failure. The upload keeps going as long as bytes are moving. Silence for 20 seconds is treated as a hang and retried. A 503 is retried. A 422 or a photo that is still over 5 MB stops and says **Stopped**. It is not sent again.

The server stores a report by the id the phone created. Sending that id again returns the same report. Sending the same photo id again does not write a second file.

## Decisions

- **React Native CLI, not Expo.** The test asks for a bare app.
- **Express on this computer.** The backend is not the thing being scored, and it is the only way to cut the connection, refuse, or hang on command.
- **The queue is a JSON file plus the photo files.** One inspector does not need a database. The file is replaced only after a temp file is written, so a kill mid-write keeps the previous queue. SQLite would be the next step if more than one writer existed.
- **Upload logic does not import React.** `src/engine` is the queue. Screens only render it. `npm test` drives it with a fake server.
- **A report is saved before any request.** The button says **Save on this phone**. The server list is a separate fetch. Pulling that list never copies the phone queue into it.
- **Each photo is acknowledged on its own.** A kill after photo two leaves photo three pending. The finished photos are not sent again. If the response was lost after the server stored the file, the retry gets `duplicate: true`.
- **Network failures retry forever, with a growing pause** (2s, 5s, 15s, 30s, then 60s). A rejection does not retry.
- **Photos are shrunk on the phone before they are queued.** The steps start at 2560px and quality 82 and only go smaller if the file is still over 5 MB. A photo that is already under the cap is copied as-is. The work happens in the native resizer, not on the JavaScript thread. The app will not start the upload while a photo is still over 5 MB.
- **Clear this phone does not delete the server.** The server is the record of work that already arrived. The README command above wipes the demo sink when you want a clean recording.

## Not done

- Upload does not continue for long after Android freezes the app in the background. It resumes when you open the app, and it keeps going while the app is open or briefly backgrounded. A foreground service would be the next day.
- A dropped photo starts again from the first byte. The server still will not store it twice. Chunk resume is not built.
- iOS is set up enough to open the project. It was not run.
- There is no login, map, comments, video, or editing a report that has already been accepted.

## Screen recording

Two or three minutes, with the server log visible if you can:

1. Airplane mode on. Save a report with a couple of photos. Point at **Saved on this phone**.
2. Force-quit and reopen. It is still there.
3. Connection on. Tap **Drop twice**. Watch it retry, then land.
4. Tap **Refresh server list**. Open the report so the photos are the ones the server returned.
