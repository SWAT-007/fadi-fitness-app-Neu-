import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../../../server/src/db'

const normalizeEmail = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const normalizeName = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const normalizePassword = (value: unknown) =>
  typeof value === 'string' ? value : ''

const hashInviteToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex')

const loadInviteToken = async (rawToken: string) => {
  const tokenHash = hashInviteToken(rawToken)
  return prisma.clientLinkToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      trainerId: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      trainer: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
  })
}

const isInviteExpired = (expiresAt: Date) => expiresAt.getTime() <= Date.now()

const invalidInvite = (message: string, status: number) =>
  NextResponse.json({ ok: false, message }, { status })

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const invite = await loadInviteToken(token)

  if (!invite) {
    return invalidInvite('Einladungslink wurde nicht gefunden.', 404)
  }

  if (invite.consumedAt) {
    return invalidInvite('Einladungslink wurde bereits verwendet.', 409)
  }

  if (isInviteExpired(invite.expiresAt)) {
    return invalidInvite('Einladungslink ist abgelaufen.', 410)
  }

  return NextResponse.json({
    ok: true,
    invite: {
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      trainerName: invite.trainer.user.fullName,
    },
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const body = await request.json().catch(() => null) as {
    fullName?: unknown
    email?: unknown
    password?: unknown
  } | null

  const fullName = normalizeName(body?.fullName)
  const email = normalizeEmail(body?.email)
  const password = normalizePassword(body?.password)

  if (!fullName || !email || password.length < 6) {
    return invalidInvite('Ungültige Anfrage.', 400)
  }

  const invite = await loadInviteToken(token)
  if (!invite) {
    return invalidInvite('Einladungslink wurde nicht gefunden.', 404)
  }

  if (invite.consumedAt) {
    return invalidInvite('Einladungslink wurde bereits verwendet.', 409)
  }

  if (isInviteExpired(invite.expiresAt)) {
    return invalidInvite('Einladungslink ist abgelaufen.', 410)
  }

  if (normalizeEmail(invite.email) !== email) {
    return invalidInvite('Diese Einladung gilt für eine andere E-Mail-Adresse.', 400)
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const consumedAt = new Date()

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          clientProfile: {
            select: {
              id: true,
              trainerId: true,
            },
          },
        },
      })

      const existingClientProfile = await tx.clientProfile.findFirst({
        where: {
          trainerId: invite.trainerId,
          email,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
        },
      })

      if (existingUser && existingUser.role !== UserRole.CLIENT) {
        throw new Error('Diese E-Mail-Adresse gehört bereits zu einem Trainerkonto.')
      }

      if (existingUser?.clientProfile && existingUser.clientProfile.trainerId !== invite.trainerId) {
        throw new Error('Dieses Client-Konto ist bereits einem anderen Trainer zugeordnet.')
      }

      if (
        existingClientProfile?.userId &&
        (!existingUser || existingClientProfile.userId !== existingUser.id)
      ) {
        throw new Error('Für diese Einladung existiert bereits ein verknüpftes Client-Profil.')
      }

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              fullName,
              passwordHash,
              role: UserRole.CLIENT,
            },
            select: { id: true, email: true },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.CLIENT,
              fullName,
            },
            select: { id: true, email: true },
          })

      let clientProfileId = existingUser?.clientProfile?.id ?? null

      if (existingClientProfile && !existingClientProfile.userId) {
        const linkedProfile = await tx.clientProfile.update({
          where: { id: existingClientProfile.id },
          data: {
            userId: user.id,
            fullName,
            email,
            status: 'active',
          },
          select: { id: true },
        })
        clientProfileId = linkedProfile.id
      } else if (!existingUser?.clientProfile) {
        const createdProfile = await tx.clientProfile.create({
          data: {
            userId: user.id,
            trainerId: invite.trainerId,
            fullName,
            email,
            status: 'active',
          },
          select: { id: true },
        })
        clientProfileId = createdProfile.id
      }

      await tx.clientLinkToken.update({
        where: { id: invite.id },
        data: { consumedAt },
      })

      return {
        clientProfileId,
        email: user.email,
        fullName,
      }
    })

    return NextResponse.json({
      ok: true,
      client: result,
      message: 'Einladung erfolgreich angenommen.',
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return invalidInvite('Diese E-Mail-Adresse ist bereits vergeben.', 409)
    }

    const message = error instanceof Error
      ? error.message
      : 'Einladung konnte nicht angenommen werden.'

    return invalidInvite(message, 400)
  }
}
