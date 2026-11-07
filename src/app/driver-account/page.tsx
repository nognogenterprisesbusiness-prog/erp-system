import { logoutAction } from "@/app/auth/actions";

export default function DriverAccountPage() {
  return <main className="mx-auto max-w-md space-y-4 px-6 py-16">
    <h1 className="text-2xl font-semibold">Driver account</h1>
    <p>Open the Nognog mobile app and sign in to see your truck and record expenses.</p>
    <form action={logoutAction}><button className="underline" type="submit">Sign out</button></form>
  </main>;
}
