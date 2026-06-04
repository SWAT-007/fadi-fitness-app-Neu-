import { prisma } from "../db";

export interface TrainerScope {
  trainerProfileId: string | undefined;
  filterTrainerId: string | undefined;
  isAdmin: boolean;
}

export async function resolveScope(user: { userId: string; role: string }): Promise<TrainerScope> {
  const isAdmin = user.role.toLowerCase() === "admin";

  const trainerProfile = await prisma.trainerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });

  if (!isAdmin && !trainerProfile) {
    throw new Error("TrainerProfile not found");
  }

  return {
    trainerProfileId: trainerProfile?.id,
    filterTrainerId: isAdmin ? undefined : trainerProfile?.id,
    isAdmin,
  };
}
