import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Determines the appropriate "from" address for Resend.
 * Prefers process.env.EMAIL_FROM if configured.
 * If provided `from` contains `@gmail.com` or similar unverified personal domain,
 * falls back to process.env.EMAIL_FROM or 'onboarding@resend.dev'.
 */
const getFromAddress = (from) => {
  const defaultFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";
  if (!from) return defaultFrom;
  // If caller explicitly passed a @gmail.com address (e.g. process.env.EMAIL_USER), override with EMAIL_FROM
  if (typeof from === "string" && (from.includes("@gmail.com") || from.includes("@yahoo.com") || from.includes("@hotmail.com"))) {
    return defaultFrom;
  }
  return from;
};

// Compatibility wrapper for Nodemailer interface `transporter.sendMail(...)`
export const transporter = {
  sendMail: async ({ from, to, subject, text, html }) => {
    const sender = getFromAddress(from);
    const { data, error } = await resend.emails.send({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    });

    if (error) {
      console.error("Resend sendMail error:", error);
      throw new Error(error.message || "Resend email failed");
    }

    return data;
  },
};

export const sendMail = async ({ to, subject, html, text, from }) => {
  const sender = getFromAddress(from);
  const { data, error } = await resend.emails.send({
    from: sender,
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
