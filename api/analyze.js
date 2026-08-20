const { OpenAI } = require('openai');

const DEFAULT_NVIDIA_KEY = process.env.NVIDIA_API_KEY || "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";
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct";

module.exports = async (req, res) => {
  // CORS Headers for Vercel Serverless
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { image, prompt, apiKey, model, customSystemPrompt, history } = body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image payload provided." });
    }

    const targetApiKey = apiKey && apiKey.trim() ? apiKey.trim() : DEFAULT_NVIDIA_KEY;
    const targetModel = model && model.trim() ? model.trim() : DEFAULT_MODEL;
    const promptText = prompt && prompt.trim() 
      ? prompt.trim() 
      : "Examine the camera view carefully. Identify the main object placed in front of the camera, describe its exact position, color, key features, function, and any notable markings or context.";

    const openai = new OpenAI({
      baseURL: DEFAULT_BASE_URL,
      apiKey: targetApiKey
    });

    let formattedImageUrl = image;
    if (!image.startsWith('data:image/')) {
      formattedImageUrl = `data:image/jpeg;base64,${image}`;
    }

    const messages = [];
    const sysPrompt = customSystemPrompt && customSystemPrompt.trim()
      ? customSystemPrompt.trim()
      : "You are a smart, context-aware AI vision assistant looking through a camera feed. You remember past objects seen and previous user questions. Answer user questions based on both the current camera view and conversation memory.";

    messages.push({ role: "system", content: sysPrompt });

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
        console.warn(`Vercel Vision API model [${mName}] failed:`, err.message || err);
        lastErr = err;
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!completion) {
      throw lastErr || new Error("NVIDIA Vision API is currently experiencing heavy load. Please retry in a moment.");
    }

    const elapsedMs = Date.now() - startTime;
    const analysisText = completion.choices[0]?.message?.content || "No analysis generated.";

    return res.status(200).json({
      success: true,
      analysis: analysisText,
      model: usedModel,
      latencyMs: elapsedMs,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Vercel Vision API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to process image with NVIDIA Vision API.",
      details: error.stack
    });
  }
};
