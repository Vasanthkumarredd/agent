module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: "online",
    service: "AI Camera Vision Analyzer (Vercel Serverless)",
    timestamp: new Date().toISOString(),
    defaultModel: "meta/llama-3.2-11b-vision-instruct"
  });
};
