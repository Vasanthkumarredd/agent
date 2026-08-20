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
    const { image, prompt, apiKey, model, customSystemPrompt, history } = req.body;

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

    const sysPrompt = customSystemPrompt && customSystemPrompt.trim()
      ? customSystemPrompt.trim()
      : "You are a smart, context-aware AI vision assistant looking through a camera feed. You remember past objects seen and previous user questions. Answer user questions based on both the current camera view and conversation memory.";

    messages.push({
      role: "system",
      content: sysPrompt
    });

    // Append conversation memory turns if provided
    if (Array.isArray(history) && history.length > 0) {
      history.slice(-8).forEach(item => {
        if (item && item.role && item.content) {
          messages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.content)
          });
        }
      });
    }

    // Add current multimodal turn
    messages.push({
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: formattedImageUrl } }
      ]
    });

    const startTime = Date.now();

    // Multi-model fallback retry loop to prevent 500 status code errors from cloud API
    const modelsToTry = [targetModel, "meta/llama-3.2-11b-vision-instruct", "nvidia/neva-22b"].filter((v, i, a) => a.indexOf(v) === i);
    let completion = null;
    let usedModel = targetModel;
    let lastErr = null;

    for (const mName of modelsToTry) {
      try {
        completion = await openai.chat.completions.create({
          model: mName,
          messages: messages,
          max_tokens: 1024,
          temperature: 0.2,
          top_p: 0.9
        });
        usedModel = mName;
        break;
      } catch (err) {
        console.warn(`Vision API model [${mName}] failed:`, err.message || err);
        lastErr = err;
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!completion) {
      throw lastErr || new Error("NVIDIA Vision API is currently experiencing heavy load. Please retry in a moment.");
    }

    const elapsedMs = Date.now() - startTime;
    const analysisText = completion.choices[0]?.message?.content || "No analysis generated.";

    return res.json({
      success: true,
      analysis: analysisText,
      model: usedModel,
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

// Email Dispatch Endpoint
const nodemailer = require('nodemailer');

app.post('/api/send-email', async (req, res) => {
  try {
    const { toEmail, userName, personalInfo, analysisText, model, timestamp, image } = req.body;

    if (!toEmail) {
      return res.status(400).json({ success: false, error: "Recipient email address is required." });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = process.env.SMTP_PORT || 587;

    let transporter;

    if (smtpHost && smtpUser && smtpPass) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPass }
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
    }

    const mailSubject = `NEXUS Vision Inspection Report - ${userName || 'User'} (${timestamp || new Date().toLocaleDateString()})`;

    const emailContentHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background: #0f172a; color: #00f2fe; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">NEXUS VISION AI</h2>
          <p style="margin: 5px 0 0 0; color: #94a3b8; font-size: 14px;">Camera Inspection & Personal Report</p>
        </div>
        <div style="padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
          <h3>👤 User Info & Notes</h3>
          <p><strong>Name:</strong> ${userName || 'N/A'}</p>
          <p><strong>Email:</strong> ${toEmail}</p>
          <p><strong>Personal Notes:</strong> ${personalInfo || 'None provided'}</p>

          <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />

          <h3>🤖 AI Vision Analysis</h3>
          <p><strong>Model Used:</strong> ${model || 'meta/llama-3.2-11b-vision-instruct'}</p>
          <p><strong>Timestamp:</strong> ${timestamp || new Date().toISOString()}</p>
          <div style="background: #ffffff; padding: 15px; border-left: 4px solid #00f2fe; border-radius: 4px; font-size: 15px;">
            ${(analysisText || '').replace(/\n/g, '<br/>')}
          </div>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Nexus Vision AI" <${smtpUser || 'noreply@nexusvision.ai'}>`,
      to: toEmail,
      subject: mailSubject,
      html: emailContentHtml
    };

    if (image && image.startsWith('data:image/')) {
      const base64Data = image.split(',')[1];
      mailOptions.attachments = [
        {
          filename: `camera_snapshot_${Date.now()}.jpg`,
          content: base64Data,
          encoding: 'base64'
        }
      ];
    }

    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);

    return res.status(200).json({
      success: true,
      message: `Report email dispatched successfully to ${toEmail}!`,
      messageId: info.messageId,
      previewUrl: previewUrl || null
    });

  } catch (error) {
    console.error("Send Email Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send email report."
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
