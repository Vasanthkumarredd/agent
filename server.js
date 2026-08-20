const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Allow all origins (file://, local dev servers, etc.)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Default NVIDIA API Configuration
const DEFAULT_NVIDIA_KEY = process.env.NVIDIA_API_KEY || "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";
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct";

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: "online",
    service: "AI Camera Vision Analyzer",
    timestamp: new Date().toISOString(),
    defaultModel: DEFAULT_MODEL
  });
});

// Vision Analysis API Endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, prompt, apiKey, model, customSystemPrompt } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image payload provided." });
    }

    const targetApiKey = apiKey && apiKey.trim() ? apiKey.trim() : DEFAULT_NVIDIA_KEY;
    const targetModel = model && model.trim() ? model.trim() : DEFAULT_MODEL;
    const promptText = prompt && prompt.trim() 
      ? prompt.trim() 
      : "Examine the camera view carefully. Identify the main object placed in front of the camera, describe its exact position, color, key features, function, and any notable markings or context.";

    // Initialize OpenAI client pointing to NVIDIA endpoint
    const openai = new OpenAI({
      baseURL: DEFAULT_BASE_URL,
      apiKey: targetApiKey
    });

    // Ensure image format is data URL
    let formattedImageUrl = image;
    if (!image.startsWith('data:image/')) {
      formattedImageUrl = `data:image/jpeg;base64,${image}`;
    }

    const messages = [];

    if (customSystemPrompt && customSystemPrompt.trim()) {
      messages.push({
        role: "system",
        content: customSystemPrompt.trim()
      });
    }

    messages.push({
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: formattedImageUrl } }
      ]
    });

    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: targetModel,
      messages: messages,
      max_tokens: 1024,
      temperature: 0.2, // low temperature for precise factual vision analysis
      top_p: 0.9
    });

    const elapsedMs = Date.now() - startTime;
    const analysisText = completion.choices[0]?.message?.content || "No analysis generated.";

    return res.json({
      success: true,
      analysis: analysisText,
      model: targetModel,
      latencyMs: elapsedMs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Analysis API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to process image with NVIDIA Vision API.",
      details: error.stack
    });
  }
});

const os = require('os');

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export Express app for Vercel Serverless Functions
module.exports = app;

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIp = net.address;
          break;
        }
      }
    }

    console.log(`==================================================`);
    console.log(`🤖 AI Camera Vision Analyzer is Online!`);
    console.log(`💻 Local Access:   http://localhost:${PORT}`);
    console.log(`📱 Mobile Access:  http://${localIp}:${PORT}`);
    console.log(`🎯 NVIDIA Model:   ${DEFAULT_MODEL}`);
    console.log(`==================================================`);
  });
}
