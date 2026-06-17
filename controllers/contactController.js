import { statusCodes } from "../constants/statusCodes.js";
import { MESSAGES } from "../constants/messages.js";
import { sendMail } from "../config/mail.js";

export const submitContactForm = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.GENERAL.ALL_FIELDS_REQUIRED,
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.GENERAL.INVALID_EMAIL,
      });
    }

    // Prepare email content
    const emailContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr>
      <p><small>This message was sent from the CARYO contact form.</small></p>
    `;

    // Send email to admin
    await sendMail({
      to: process.env.ADMIN_EMAIL || "info@caryo.com",
      subject: `Contact Form: ${subject}`,
      html: emailContent,
    });

    // Send confirmation email to user
    const userEmailContent = `
      <h2>Thank you for contacting CARYO!</h2>
      <p>Dear ${name},</p>
      <p>We have received your message and will get back to you as soon as possible.</p>
      <p><strong>Your message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr>
      <p>Best regards,<br>The CARYO Team</p>
    `;

    await sendMail({
      to: email,
      subject: "Thank you for contacting CARYO",
      html: userEmailContent,
    });

    res.status(statusCodes.OK).json({
      success: true,
      message: MESSAGES.GENERAL.SUCCESS_SEND,
    });
  } catch (error) {
    console.error("Contact form submission error:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: MESSAGES.GENERAL.FAILED_TO_SEND,
    });
  }
};
