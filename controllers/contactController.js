import { sendMail } from "../config/mail.js";

export const submitContactForm = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
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

    res.status(200).json({
      success: true,
      message: "Thank you for your message! We'll get back to you soon.",
    });
  } catch (error) {
    console.error("Contact form submission error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
    });
  }
};
