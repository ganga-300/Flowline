import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Choose a new password" };

// Opened from the reset email: /reset-password?token=...
export default async function ResetPasswordPage({ searchParams }) {
  const { token } = await searchParams;
  return (
    <AuthLayout>
      <ResetPasswordForm token={typeof token === "string" ? token : ""} />
    </AuthLayout>
  );
}
