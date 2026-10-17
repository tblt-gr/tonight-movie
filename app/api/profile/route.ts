import { readProfile } from "@/lib/profile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username") || "";
  try {
    return Response.json(await readProfile(username));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profil inaccessible.";
    return Response.json(
      { error: message },
      { status: message.includes("valide") || message.includes("introuvable") ? 400 : 502 },
    );
  }
}
