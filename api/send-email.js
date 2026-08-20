const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
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
    const { toEmail, userName, personalInfo, analysisText, model, timestamp, image } = body;

    if (!toEmail) {
      return res.status(400).json({ success: false, error: "Recipient email address is required." });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = process.env.SMTP_PORT || 587;

    let transporter;

    if (smtpHost && smtpUser && smtpPass) {
      // Custom SMTP Server
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
    } else {
      // Use Ethereal Test Account fallback
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
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

    // Attach image if base64 provided
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
    console.log("Email sent successfully:", info.messageId);

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
};
