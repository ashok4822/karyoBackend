import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Thin compatibility shim so existing code using `transporter.sendMail(...)` keeps working
export const transporter = {
  sendMail: async ({ from, to, subject, text, html }) => {
    const { data, error } = await resend.emails.send({
      from: from || process.env.EMAIL_FROM, // e.g. "Caaryo <noreply@caaryo.store>"
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    });

    if (error) {
      throw new Error(error.message || "Resend email failed");
    }

    return data;
  },
};

export const sendMail = async ({ to, subject, html, text }) => {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
  });

  if (error) {
    console.error("Error sending email via Resend:", error);
    throw new Error(error.message || "Resend email failed");
  }

  console.log("Email sent successfully:", data?.id);
  return data;
};
