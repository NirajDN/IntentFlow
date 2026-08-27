import dotenv from "dotenv";
import Razorpay from "razorpay";

dotenv.config({
  path: "C:\\NIRAJDN\\IntentFlow\\apps\\api\\.env",
  override: true,
});

const keyId = process.env["RAZORPAY_KEY_ID"];
const keySecret = process.env["RAZORPAY_KEY_SECRET"];

if (!keyId || !keySecret) {
  throw new Error(
    "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured"
  );
}

const razorpayClient = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

export const razorpay = razorpayClient;

export function getRazorpayKeyId(): string {
  return keyId!;
}
