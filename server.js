import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend files
app.use(express.static(__dirname));

// Rate Limiting Store
const userLimits = {}; // format: { userId: { count: number, date: string } }
const userSessions = {}; // format: { sessionId: [messageParts] }
const DAILY_LIMIT = 50;

app.post("/api/chat", async (req, res) => {
    try {
        const { message: userMessage, userId, sessionId } = req.body;

        if (!userId || !sessionId) {
            return res.status(400).json({ error: "User ID and Session ID are required" });
        }

        // Rate Limiting Logic
        const today = new Date().toISOString().split('T')[0];

        if (!userLimits[userId]) {
            userLimits[userId] = { count: 0, date: today };
        }

        // Reset if new day
        if (userLimits[userId].date !== today) {
            userLimits[userId] = { count: 0, date: today };
        }

        // Check limit (Bypass for localhost)
        const isLocal = req.ip === "::1" || req.ip === "127.0.0.1" || req.hostname === "localhost";
        if (!isLocal && userLimits[userId].count >= DAILY_LIMIT) {
            return res.status(429).json({ reply: `Daily limit is exhausted. You can ask a maximum of ${DAILY_LIMIT} questions per day.` });
        }

        // Session History Logic
        if (!userSessions[sessionId]) {
            userSessions[sessionId] = [];
        }

        // Add user message to history
        userSessions[sessionId].push({
            role: "user",
            parts: [{ text: userMessage }]
        });

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: "You are a helpful assistant. You must answer ONLY in plain text. Do NOT use markdown formatting. Keep your answers concise and under 1000 words. refuse to answer anything other than the user's question." }]
                    },
                    contents: userSessions[sessionId],
                    generationConfig: {
                        maxOutputTokens: 1300, // Approx 1000 words
                    }
                })
            }
        );

        const data = await response.json();

        // Debug log (very useful)
        console.log("AI full response:", JSON.stringify(data, null, 2));

        if (data.error) {
            console.error("AI API Error:", data.error);
            return res.status(500).json({ error: data.error.message });
        }

        if (!data.candidates || !data.candidates.length) {
            return res.status(500).json({ error: "No response from AI" });
        }

        const reply = data.candidates[0].content.parts[0].text;

        // Add model response to history
        userSessions[sessionId].push({
            role: "model",
            parts: [{ text: reply }]
        });

        // Increment usage count only on success
        userLimits[userId].count++;

        res.json({ reply });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Something went wrong" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
