import { requireChatGPTUser } from "./chatgpt-auth";
import LabClient from "./lab-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <LabClient displayName={user.displayName} />;
}

