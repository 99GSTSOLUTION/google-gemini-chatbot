import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

async function listModels() {
    try {
        const response = await fetch(URL);
        const data = await response.json();
        let output = "";
        if (data.models) {
            output += "Available Models:\n";
            data.models.forEach(m => {
                output += `- ${m.name}\n`;
            });
        } else {
            output += "Error: " + JSON.stringify(data, null, 2);
        }
        fs.writeFileSync("models_log.txt", output, "utf8");
        console.log("Written to models_log.txt");
    } catch (error) {
        console.error("Failed to fetch models:", error);
    }
}

listModels();
