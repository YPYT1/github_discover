import { getEnv } from "@/lib/env";
import { repository } from "@/lib/repositories";
import { errorResponse, AppError } from "@/lib/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  try {
    const { owner, name } = await params;
    if (!/^[a-zA-Z0-9-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(name))
      throw new AppError("invalidRequest");
    return Response.json(
      await repository(await getEnv(), `${owner}/${name}`, true),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
