import { instrument } from "@fiberplane/hono-otel";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Hono } from "hono";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { AssemblyAI } from 'assemblyai';
import { Buffer } from "buffer";

interface Bindings {
  DATABASE_URL: string;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🎙️ Super Fancy Audio Recorder Demo 🎉</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #f8b195, #f67280, #c06c84, #6c5b7b, #355c7d);
            background-size: 400% 400%;
            animation: gradientBG 10s ease infinite;
            color: #fff;
            text-align: center;
            padding: 50px;
          }

          @keyframes gradientBG {
            0%{background-position:0% 50%}
            50%{background-position:100% 50%}
            100%{background-position:0% 50%}
          }

          h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.4);
          }

          button {
            background: #fff;
            color: #333;
            font-size: 1em;
            padding: 10px 20px;
            margin: 10px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }

          button:hover {
            transform: scale(1.05);
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
          }

          #transcriptContainer {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(5px);
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
          }

          #transcriptContainer h2 {
            margin-top: 0;
            font-size: 1.8em;
          }

          #transcript {
            font-size: 1.2em;
            margin-top: 10px;
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .emoji {
            font-size: 1.5em;
            margin: 0 5px;
          }

          #recordButton.recording {
            background: #ff4b5c;
            color: #fff;
          }

          #recordButton.recording::after {
            content: ' 🎤';
          }
        </style>
    </head>
    <body>
        <h1>🎧 Welcome to the Super Fancy Audio Recorder 🎉</h1>
        <p>Record your voice, get instant transcripts & have fun! 😎</p>
        <button id="recordButton">Start Recording</button>
        <button id="playButton" disabled>Play Recording 🎶</button>
        <div id="transcriptContainer">
          <h2>Transcript 📝</h2>
          <div id="transcript">No transcript yet... Speak up! 🤔</div>
        </div>

        <script>
            let mediaRecorder;
            let audioChunks = [];
            let audioBlob;
            let audioUrl;

            document.getElementById('recordButton').addEventListener('click', async () => {
                const recordButton = document.getElementById('recordButton');
                if (recordButton.textContent.includes('Start Recording')) {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);

                    mediaRecorder.ondataavailable = (event) => {
                        audioChunks.push(event.data);
                    };

                    mediaRecorder.onstop = async () => {
                        audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
                        audioUrl = URL.createObjectURL(audioBlob);
                        document.getElementById('playButton').disabled = false;

                        // Send the audioBlob to the server for transcription
                        const response = await fetch('/api/transcribe', {
                          method: 'POST',
                          body: audioBlob
                        });
                        const result = await response.json();

                        // Display the transcript
                        const transcriptDiv = document.getElementById('transcript');
                        if (result.error) {
                          transcriptDiv.textContent = 'Error: ' + result.error + ' 😵';
                        } else {
                          transcriptDiv.textContent = result.transcript + ' 🎉';
                        }
                    };

                    mediaRecorder.start();
                    audioChunks = [];
                    recordButton.textContent = 'Stop Recording';
                    recordButton.classList.add('recording');
                } else {
                    mediaRecorder.stop();
                    recordButton.textContent = 'Start Recording';
                    recordButton.classList.remove('recording');
                }
            });

            document.getElementById('playButton').addEventListener('click', () => {
                const audio = new Audio(audioUrl);
                audio.play();
            });
        </script>
    </body>
    </html>`;
  return c.html(htmlContent);
});

app.post("/api/transcribe", async (c) => {
  const client = new AssemblyAI({
    apiKey: '', // DO NOT REMOVE API KEY
  });

  try {
    // Get the audio data from the request body as an ArrayBuffer
    const arrayBuffer = await c.req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload the file to AssemblyAI
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: '', // Same API key here
        'content-type': 'application/octet-stream'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Upload failed: ${text}`);
    }

    const uploadJson = await uploadRes.json() as { upload_url: string };
    const uploadedUrl = uploadJson.upload_url;

    // Now transcribe using the uploaded file
    const transcript = await client.transcripts.transcribe({ audio: uploadedUrl }) as { text: string };
    return c.json({ transcript: transcript.text });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return c.json({ error: errorMessage }, 500);
  }
});

// Existing CRUD routes
app.get("/api/users", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);
  const usersList = await db.select().from(users);
  return c.json({ users: usersList });
});

app.get("/api/users/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);
  const id = Number.parseInt(c.req.param("id"), 10);
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

app.post("/api/users", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);
  const newUser = await c.req.json();
  const insertedUser = await db.insert(users).values(newUser).returning();
  return c.json(insertedUser, 201);
});

app.put("/api/users/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);
  const id = Number.parseInt(c.req.param("id"), 10);
  const updatedData = await c.req.json();
  const updatedUser = await db.update(users).set(updatedData).where(eq(users.id, id)).returning();
  return c.json(updatedUser);
});

app.delete("/api/users/:id", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);
  const id = Number.parseInt(c.req.param("id"), 10);
  await db.delete(users).where(eq(users.id, id));
  return c.json({ message: "User deleted" });
});

export default instrument(app);
